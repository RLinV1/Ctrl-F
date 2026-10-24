import { useRef, useState } from "react";
import StatusLine, { Status } from "./Status";

// Hold the button to record, release to transcribe with ElevenLabs (via the dev server).
export default function Mic() {
  const [status, setStatus] = useState<Status>({ text: "Hold the button, speak, release." });
  const recorder = useRef<MediaRecorder | null>(null);

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: Blob[] = [];
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setStatus({ text: "Transcribing..." });
        const res = await fetch("/api/stt", { method: "POST", body: new Blob(chunks, { type: rec.mimeType }) });
        const data = await res.json();
        setStatus(res.ok ? { text: `"${data.text}"  (${data.seconds}s)` } : { text: data.error, error: true });
      };
      rec.start();
      recorder.current = rec;
      setStatus({ text: "Recording..." });
    } catch (err) {
      setStatus({ text: `Mic unavailable: ${(err as Error).message}`, error: true });
    }
  }

  function stop() {
    if (recorder.current?.state === "recording") recorder.current.stop();
  }

  return (
    <section>
      <h2>Microphone: speech to text</h2>
      <button onMouseDown={start} onMouseUp={stop} onMouseLeave={stop}>
        Hold to record
      </button>
      <StatusLine status={status} />
    </section>
  );
}
