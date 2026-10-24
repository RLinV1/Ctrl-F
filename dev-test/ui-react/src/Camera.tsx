import { useEffect, useRef, useState } from "react";
import StatusLine, { Status } from "./Status";

// Live webcam preview. "Save photo" stores a JPEG under datasets/ctrlf/raw/<item>/ for YOLO training.
export default function Camera() {
  const video = useRef<HTMLVideoElement>(null);
  const [item, setItem] = useState("keys");
  const [status, setStatus] = useState<Status>({ text: "" });

  useEffect(() => {
    let stream: MediaStream | undefined;
    navigator.mediaDevices
      .getUserMedia({ video: true })
      .then((s) => {
        stream = s;
        if (video.current) video.current.srcObject = s;
      })
      .catch((err: Error) => setStatus({ text: `Camera unavailable: ${err.message}`, error: true }));
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, []);

  function snap() {
    const el = video.current;
    if (!el) return;
    const canvas = document.createElement("canvas");
    canvas.width = el.videoWidth;
    canvas.height = el.videoHeight;
    canvas.getContext("2d")!.drawImage(el, 0, 0);
    canvas.toBlob(
      async (blob) => {
        const res = await fetch(`/api/collect?item=${encodeURIComponent(item)}`, { method: "POST", body: blob });
        const data = await res.json();
        setStatus(res.ok ? { text: `Saved. ${data.count} photos of ${data.item}.` } : { text: data.error, error: true });
      },
      "image/jpeg",
      0.92,
    );
  }

  return (
    <section>
      <h2>Camera: collect training photos</h2>
      <video ref={video} autoPlay playsInline muted />
      <p>
        <input value={item} onChange={(e) => setItem(e.target.value)} size={12} aria-label="Item class" />{" "}
        <button onClick={snap}>Save photo</button>
      </p>
      <StatusLine status={status} />
    </section>
  );
}
