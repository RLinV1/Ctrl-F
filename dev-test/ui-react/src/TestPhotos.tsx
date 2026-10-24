import { useEffect, useState } from "react";
import { readJson } from "./api";
import { Box, Overlay } from "./Results";

type Found = {
  status: string;
  message: string;
  matches: Box[];
  detections: Box[];
  model: string;
  seconds: number;
  error?: string;
};
type Shot = { name: string; url: string; result?: Found; failed?: string };

// Try the model on photos you already have: pick or drop one or many, optionally say what you are looking for
// ("where are my keys and wallet"), and see every box it finds. With no question, every detection is shown.
export default function TestPhotos() {
  const [shots, setShots] = useState<Shot[]>([]);
  const [ask, setAsk] = useState("");
  const [busy, setBusy] = useState(false);
  const [models, setModels] = useState<{ name: string; mb: number }[]>([]);
  const [selected, setSelected] = useState("");

  useEffect(() => {
    fetch("/api/models").then((r) => r.json()).then((m) => { setModels(m.models); setSelected(m.selected); }).catch(() => {});
  }, []);

  async function pickModel(name: string) {
    setSelected(name);
    await fetch("/api/model", { method: "POST", body: JSON.stringify({ name }) }).catch(() => {});
  }

  async function test(files: FileList | File[]) {
    const photos = [...files].filter((f) => f.type.startsWith("image/"));
    if (!photos.length) return;
    setBusy(true);
    const added: Shot[] = photos.map((f) => ({ name: f.name, url: URL.createObjectURL(f) }));
    setShots((old) => [...added, ...old]);
    for (const [i, file] of photos.entries()) {
      let update: Partial<Shot>;
      try {
        const res = await fetch(`/api/find?quick=1&text=${encodeURIComponent(ask)}`, { method: "POST", body: file });
        const body = await readJson<Found>(res);
        update = res.ok ? { result: body } : { failed: body.error ?? "The model could not read this photo" };
      } catch {
        update = { failed: "Could not reach the API server" };
      }
      setShots((old) => old.map((s) => (s.url === added[i].url ? { ...s, ...update } : s)));
    }
    setBusy(false);
  }

  return (
    <section>
      <h2>Test the model on your photos</h2>
      <p>
        Model{" "}
        <select value={selected} onChange={(e) => void pickModel(e.target.value)} aria-label="Model">
          {models.map((m) => <option key={m.name} value={m.name}>{m.name} ({m.mb} MB)</option>)}
        </select>
      </p>
      <p>
        <input
          value={ask}
          onChange={(e) => setAsk(e.target.value)}
          placeholder='What to find, e.g. "where are my keys and wallet" (empty shows everything)'
          aria-label="What to find"
          style={{ width: "100%", boxSizing: "border-box" }}
        />
      </p>
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); void test(e.dataTransfer.files); }}
        style={{ border: "2px dashed #999", borderRadius: 8, padding: "1rem" }}
      >
        Drop photos here, or{" "}
        <label><input type="file" accept="image/*" multiple hidden onChange={(e) => e.target.files && void test(e.target.files)} /><u style={{ cursor: "pointer" }}>choose photos</u></label>
        {busy && " Checking..."}
      </div>
      <div className="grid" style={{ marginTop: "0.8rem", gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))" }}>
        {shots.map((s) => {
          const asked = !!s.result?.matches.length;
          const others = s.result ? s.result.detections.filter((d) => !s.result!.matches.includes(d)) : [];
          return (
            <figure key={s.url}>
              <div style={{ position: "relative" }}>
                <img src={s.url} alt={s.name} style={{ width: "100%", display: "block" }} />
                {s.result && <Overlay boxes={others} color={asked || ask.trim() ? "#777" : "#1b8a3a"} dashed={asked || !!ask.trim()} />}
                {s.result && <Overlay boxes={s.result.matches} color="#1b8a3a" />}
              </div>
              <figcaption>
                {s.failed ? <span className="err">{s.failed}</span> : !s.result ? "Checking..." : (
                  <>
                    {ask.trim() ? s.result.message : `Found: ${s.result.detections.map((d) => `${d.name} ${Math.round((d.conf ?? 0) * 100)}%`).join(", ") || "nothing"}.`}
                    <br />
                    <span className="out">{s.name}, {s.result.model}, {s.result.seconds}s</span>
                  </>
                )}
              </figcaption>
            </figure>
          );
        })}
      </div>
      {shots.length === 0 && <p className="out">Nothing tested yet.</p>}
    </section>
  );
}
