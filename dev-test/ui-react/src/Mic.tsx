import { useRef, useState } from "react";
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
  const camera = useRef<{ stream: MediaStream; video: HTMLVideoElement } | null>(null);

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
      // Open the camera now so it has warmed up (first webcam frames are dark) by the time we stop talking.
      const videoStream = await navigator.mediaDevices.getUserMedia({ video: true }).catch(() => null);
      if (videoStream) {
        const video = document.createElement("video");
        video.muted = true;
        video.srcObject = videoStream;
        await video.play();
        camera.current = { stream: videoStream, video };
      }
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

  // Grab one frame from the open camera, then release it.
  async function takePhoto(): Promise<Blob | null> {
    const cam = camera.current;
    camera.current = null;
    if (!cam) return null;
    const canvas = document.createElement("canvas");
    canvas.width = cam.video.videoWidth;
    canvas.height = cam.video.videoHeight;
    canvas.getContext("2d")!.drawImage(cam.video, 0, 0);
    cam.stream.getTracks().forEach((t) => t.stop());
    return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
  }

  async function finish(clip: Blob) {
    const photo = await takePhoto();
    if (clip.size === 0) return trouble("no audio was captured from the microphone");
    if (!photo) return trouble("no camera is available, so no photo could be taken");
    setClipUrl(URL.createObjectURL(clip));
    setPhotoUrl(URL.createObjectURL(photo));
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
      <button onClick={toggle}>{recording ? "Stop" : "Start"}</button>
      {clipUrl && (
        <p>
          <audio controls src={clipUrl} />
        </p>
      )}
      <StatusLine status={status} />
      {says && <p><b>{says}</b></p>}
      {photoUrl && (
        <div style={{ position: "relative", maxWidth: 640 }}>
          <img src={photoUrl} alt="Photo taken when you stopped speaking" style={{ width: "100%", display: "block" }} />
          {result && <Overlay boxes={others} color="#777" dashed />}
          {result && <Overlay boxes={result.matches} color="#1b8a3a" />}
        </div>
      )}
      {result && (
        <p className="out">
          Model {result.model}, {result.seconds}s. Green = what you asked for, gray = other things it knows. Detected:{" "}
          {result.detections.map((d) => `${d.name} ${Math.round((d.conf ?? 0) * 100)}%`).join(", ") || "nothing"}.
        </p>
      )}
    </section>
  );
}
