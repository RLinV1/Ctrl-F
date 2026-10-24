import { useRef, useState } from "react";
import StatusLine, { Status } from "./Status";

// Click to start recording, click again to stop. The clip is sent to ElevenLabs (via the dev server)
// and also shown in a player so you can hear exactly what was captured.
export default function Mic() {
  const [recording, setRecording] = useState(false);
  const [status, setStatus] = useState<Status>({ text: "Click Start, speak, then click Stop." });
  const [clipUrl, setClipUrl] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : undefined;
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        void transcribe(new Blob(chunks, { type: rec.mimeType }));
      };
      rec.start();
      recorder.current = rec;
      setRecording(true);
      setClipUrl(null);
      setStatus({ text: "Recording... click Stop when done." });
    } catch (err) {
      setStatus({ text: `Mic unavailable: ${(err as Error).message}`, error: true });
    }
  }

  async function transcribe(clip: Blob) {
    if (clip.size === 0) return setStatus({ text: "No audio was captured. Check the mic in browser settings.", error: true });
    setClipUrl(URL.createObjectURL(clip));
    setStatus({ text: `Transcribing ${Math.round(clip.size / 1024)} KB (${clip.type})...` });
    try {
      const res = await fetch("/api/stt", { method: "POST", body: clip });
      const data = await res.json();
      setStatus(res.ok ? { text: `"${data.text}"  (${data.seconds}s)` } : { text: `Server error: ${data.error}`, error: true });
    } catch (err) {
      setStatus({ text: `Could not reach the API server (is dev-test/server.py running?): ${(err as Error).message}`, error: true });
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
      <h2>Microphone: speech to text</h2>
      <button onClick={toggle}>{recording ? "Stop" : "Start recording"}</button>
      {clipUrl && (
        <p>
          <audio controls src={clipUrl} />
        </p>
      )}
      <StatusLine status={status} />
    </section>
  );
}
