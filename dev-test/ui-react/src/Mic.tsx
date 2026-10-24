import { useEffect, useRef, useState } from "react";
import { readJson } from "./api";
import { Box } from "./Results";
import StatusLine, { Status } from "./Status";

type Found = {
  transcript: string;
  target: string | null;
  status: "found" | "not_visible" | "unsupported" | "no_target";
  message: string;
  narration: string | null;
  matches: Box[];
  detections: Box[];
  model: string;
  seconds: number;
};

// Speak, then click Stop: the photo is taken at that moment, the speech is transcribed, and the trained
// model looks in the photo for the item you asked for. The recording is kept in a player so you can replay it.
export default function Mic() {
  const [recording, setRecording] = useState(false);
  const [status, setStatus] = useState<Status>({ text: "Click Start, say what you are looking for, then click Stop." });
  const [clipUrl, setClipUrl] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [result, setResult] = useState<Found | null>(null);
  const [says, setSays] = useState("");
  const [job, setJob] = useState<string | null>(null); // the current Pi job, so Refresh can ask for its result again
  const recorder = useRef<MediaRecorder | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const voice = useRef<HTMLAudioElement | null>(null); // Sherlock's reply while it plays
  const round = useRef(0); // bumped on every Start, so a reply still being fetched for the last round is dropped
  const [modalOpen, setModalOpen] = useState(false);
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (modalOpen && !d.open) d.showModal();
    if (!modalOpen && d.open) d.close();
  }, [modalOpen]);

  // Show the reply and read it aloud with ElevenLabs. If speech fails the text is still on the page.
  async function say(text: string) {
    const mine = round.current;
    setSays(text);
    try {
      const res = await fetch("/api/tts", { method: "POST", body: JSON.stringify({ text }) });
      if (!res.ok || mine !== round.current) return;
      voice.current = new Audio(URL.createObjectURL(await res.blob()));
      if (mine === round.current) await voice.current.play();
    } catch {
      /* no audio: the text above is enough */
    }
  }

  // Something broke: Sherlock explains it (Gemini + ElevenLabs) instead of the page showing an error.
  async function trouble(problem: string) {
    setStatus({ text: "" });
    let narration: string | null = null;
    try {
      narration = (await readJson(await fetch("/api/trouble", { method: "POST", body: JSON.stringify({ problem }) }))).narration;
    } catch {
      /* API server is down: fall through to the plain line */
    }
    await say(narration ?? "The machinery has hit a snag. Please try again in a moment.");
  }

  async function start() {
    round.current += 1;
    voice.current?.pause(); // a new request cuts off the last reply
    try {
      const audio = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : undefined;
      const rec = new MediaRecorder(audio, mimeType ? { mimeType } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
      rec.onstop = () => audio.getTracks().forEach((t) => t.stop());
      rec.start();
      recorder.current = rec;
      setRecording(true);
      setClipUrl(null);
      setPhotoUrl(null);
      setResult(null);
      setSays("");
      setJob(null);
      setStatus({ text: "Listening... click Stop when you are done." });
      rec.addEventListener("stop", () => void finish(new Blob(chunks, { type: rec.mimeType })), { once: true });
    } catch (err) {
      void trouble(`the microphone is unavailable (${(err as Error).message})`);
    }
  }

  // Poll until results/<job>_result.jpg is in the bucket. Refresh in the popup polls again.
  async function waitForResult(job: string) {
    const mine = round.current;
    setStatus({ text: "Photo received. Waiting for the result..." });
    try {
      for (let tries = 0; tries < 90 && mine === round.current; tries++) {
        const poll = await fetch(`/api/pi/result?job=${job}`);
        if (poll.status === 202) { await new Promise((r) => setTimeout(r, 1000)); continue; }
        if (!poll.ok) return trouble("the result could not be read from the bucket");
        const found = await readJson<{ photo: string; narration: string | null; message: string | null }>(poll);
        setPhotoUrl(`/api/s3/image?key=${encodeURIComponent(found.photo)}`);
        setStatus({ text: "Result received." });
        const line = found.narration ?? found.message;
        return line ? await say(line) : undefined;
      }
    } catch {
      setStatus({ text: "Could not reach the API server (is dev-test/server.py running?)", error: true });
    }
    if (mine === round.current) setStatus({ text: "The result did not arrive yet. Click Refresh to check the bucket again.", error: true });
  }

  // The Pi takes the photo: the server drops a job in S3, waits for the Pi's upload, then the popup waits for results/<job>_result.jpg.
  async function finish(clip: Blob) {
    setModalOpen(true);
    if (clip.size === 0) return trouble("no audio was captured from the microphone");
    setClipUrl(URL.createObjectURL(clip));
    try {
      setStatus({ text: "Transcribing..." });
      const stt = await readJson(await fetch("/api/stt", { method: "POST", body: clip }));
      if (stt.error) return trouble("the speech could not be transcribed");
      setStatus({ text: `Heard "${stt.text}". Asking the Pi for a photo...` });
      const res = await fetch(`/api/pi/find?text=${encodeURIComponent(stt.text)}`, { method: "POST" });
      const sent = await readJson<{ job: string | null; photo: string | null; narration?: string | null; message?: string }>(res);
      if (!res.ok) return trouble(res.status === 504 ? "the camera on the Pi did not answer" : "the item-finding model is not available yet");
      if (!sent.job || !sent.photo) { // nothing to look for: Sherlock answers, no photo
        setStatus({ text: `Heard "${stt.text}"` });
        return await say(sent.narration ?? sent.message ?? "");
      }
      setPhotoUrl(`/api/s3/image?key=${encodeURIComponent(sent.photo)}`); // the Pi's photo now; results/<job>_result.jpg replaces it
      setResult(null);
      setJob(sent.job);
      await waitForResult(sent.job);
    } catch {
      setStatus({ text: "Could not reach the API server (is dev-test/server.py running?)", error: true });
    }
  }

  function toggle() {
    if (recording) {
      recorder.current?.stop();
      setRecording(false);
    } else {
      void start();
    }
  }

  return (
    <section>
      <h2>Speak to the mic</h2>
      <div className="speak">
        <div>
          <button onClick={toggle} style={{ width: "100%", padding: "0.8rem" }}>{recording ? "Stop" : "Start"}</button>
          {clipUrl && (
            <p>
              Your recording
              <audio controls src={clipUrl} style={{ width: "100%" }} />
            </p>
          )}
          <StatusLine status={status} />
          {says && <p><b>{says}</b></p>}
        </div>
      </div>
      {/* Results popup: results/<id>_result.jpg, the snapshot with the boxes already drawn by the server. */}
      <dialog ref={dialog} onClose={() => setModalOpen(false)} onClick={(e) => e.target === dialog.current && setModalOpen(false)}>
        <h2>Result</h2>
        {photoUrl && (
          <div style={{ position: "relative" }}>
            <img src={photoUrl} alt="Photo taken when you stopped speaking" style={{ width: "100%", display: "block" }} />
          </div>
        )}
        <StatusLine status={status} />
        {says && <p><b>{says}</b></p>}
        {job && <button onClick={() => void waitForResult(job)}>Refresh</button>}{" "}
        <button onClick={() => setModalOpen(false)}>Close</button>
      </dialog>
    </section>
  );
}
