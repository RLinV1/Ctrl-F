import { useEffect, useRef, useState } from "react";
import { readJson } from "./api";
import { Box, Overlay } from "./Results";
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
  const recorder = useRef<MediaRecorder | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (modalOpen && !d.open) d.showModal();
    if (!modalOpen && d.open) d.close();
  }, [modalOpen]);

  // The camera is on as soon as this page opens (and shown live), so it is warm and ready when you speak.
  useEffect(() => {
    let stream: MediaStream | undefined;
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: true })
      .then((s) => {
        stream = s;
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        if (video.current) video.current.srcObject = s;
      })
      .catch(() => {}); // no camera or permission denied: finish() reports it when there is no photo
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Show the reply and read it aloud with ElevenLabs. If speech fails the text is still on the page.
  async function say(text: string) {
    setSays(text);
    try {
      const res = await fetch("/api/tts", { method: "POST", body: JSON.stringify({ text }) });
      if (res.ok) await new Audio(URL.createObjectURL(await res.blob())).play();
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
      setStatus({ text: "Listening... click Stop when you are done." });
      rec.addEventListener("stop", () => void finish(new Blob(chunks, { type: rec.mimeType })), { once: true });
    } catch (err) {
      void trouble(`the microphone is unavailable (${(err as Error).message})`);
    }
  }

  // Grab one frame from the live camera. The camera stays on.
  function takePhoto(): Promise<Blob | null> {
    const el = video.current;
    if (!el || !el.videoWidth) return Promise.resolve(null);
    const canvas = document.createElement("canvas");
    canvas.width = el.videoWidth;
    canvas.height = el.videoHeight;
    canvas.getContext("2d")!.drawImage(el, 0, 0);
    return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
  }

  async function finish(clip: Blob) {
    const photo = await takePhoto();
    if (photo) {
      setPhotoUrl(URL.createObjectURL(photo)); // pop the results up at once, before transcribing
      setModalOpen(true);
    }
    if (clip.size === 0) return trouble("no audio was captured from the microphone");
    if (!photo) return trouble("no camera is available, so no photo could be taken");
    setClipUrl(URL.createObjectURL(clip));
    try {
      setStatus({ text: "Transcribing..." });
      const stt = await readJson(await fetch("/api/stt", { method: "POST", body: clip }));
      if (stt.error) return trouble("the speech could not be transcribed");
      setStatus({ text: `Heard "${stt.text}". Looking in the photo...` });
      const res = await fetch(`/api/find?text=${encodeURIComponent(stt.text)}`, { method: "POST", body: photo });
      const found = await readJson<Found>(res);
      if (!res.ok) return trouble("the item-finding model is not available yet");
      setResult(found);
      setStatus({ text: `Heard "${found.transcript}"` });
      await say(found.narration ?? found.message);
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

  const others = result ? result.detections.filter((d) => !result.matches.includes(d)) : [];

  return (
    <section>
      <h2>Speak to the mic</h2>
      <div className="speak">
        <div>
          <video ref={video} autoPlay muted playsInline />
        </div>
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
          {result && (
            <p className="out">
              Model {result.model}, {result.seconds}s. Green = what you asked for, gray = other things it knows. Detected:{" "}
              {result.detections.map((d) => `${d.name} ${Math.round((d.conf ?? 0) * 100)}%`).join(", ") || "nothing"}.
            </p>
          )}
        </div>
      </div>
      {/* Results popup: the snapshot with a box where the item is. The camera behind it keeps running. */}
      <dialog ref={dialog} onClose={() => setModalOpen(false)} onClick={(e) => e.target === dialog.current && setModalOpen(false)}>
        <h2>Result</h2>
        {photoUrl && (
          <div style={{ position: "relative" }}>
            <img src={photoUrl} alt="Photo taken when you stopped speaking" style={{ width: "100%", display: "block" }} />
            {result && <Overlay boxes={others} color="#777" dashed />}
            {result && <Overlay boxes={result.matches} color="#1b8a3a" />}
          </div>
        )}
        <StatusLine status={status} />
        {says && <p><b>{says}</b></p>}
        {result && (
          <p className="out">
            Green = what you asked for, gray = other things it knows. Detected:{" "}
            {result.detections.map((d) => `${d.name} ${Math.round((d.conf ?? 0) * 100)}%`).join(", ") || "nothing"}.
          </p>
        )}
        <button onClick={() => setModalOpen(false)}>Close</button>
      </dialog>
    </section>
  );
}
