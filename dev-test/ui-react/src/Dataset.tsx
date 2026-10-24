import { useEffect, useState } from "react";
import { readJson } from "./api";
import { Overlay } from "./Results";

type Item = {
  file: string;
  boxes: { cls: number; name: string; box: [number, number, number, number] }[];
  author: string;
  source: string;
  license: string;
};
type Listing = { classes: string[]; splits: Record<string, Item[]> };

const PAGE = 60;

// Browse every labeled training image: pick a split and a class, see the human-drawn boxes.
export default function Dataset() {
  const [data, setData] = useState<Listing | null>(null);
  const [error, setError] = useState("");
  const [split, setSplit] = useState("train");
  const [cls, setCls] = useState("all");
  const [showBoxes, setShowBoxes] = useState(true);
  const [limit, setLimit] = useState(PAGE);
  const [sources, setSources] = useState<{ id: string; name: string; images: number; license: string }[]>([]);
  const [note, setNote] = useState("");

  async function loadSources() {
    const body = await readJson(await fetch("/api/dataset/sources"));
    if (!body.error) setSources(body.sources);
  }
  useEffect(() => { void loadSources(); }, []);

  // Remove one whole dataset from the training set (its images, labels and credits). The downloaded export stays on disk.
  async function removeSource(id: string, name: string, images: number) {
    if (!confirm(`Delete ${name} (${images} images) from the training set? The downloaded files stay in training/datasets/.`)) return;
    const res = await fetch("/api/dataset/delete", { method: "POST", body: JSON.stringify({ id }) });
    const body = await readJson(res);
    if (!res.ok) return setNote(body.error ?? "Delete failed");
    setNote(`Deleted ${body.removed} images.`);
    setSources(body.sources);
    const fresh = await readJson<Listing>(await fetch("/api/dataset"));
    if (!fresh.error) setData(fresh);
  }

  useEffect(() => {
    fetch("/api/dataset")
      .then(async (res) => {
        const body = await readJson(res);
        res.ok ? setData(body) : setError(body.error ?? "Request failed");
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  if (error) return <section><p className="err">{error}</p></section>;
  if (!data) return <section>Loading dataset...</section>;

  const count = (items: Item[], name: string) => items.reduce((n, i) => n + i.boxes.filter((b) => b.name === name).length, 0);
  const items = data.splits[split]
    .filter((i) => cls === "all" || i.boxes.some((b) => b.name === cls));

  return (
    <>
      <section>
        <h2>Labeled small items</h2>
        <table>
          <thead><tr><th>Split</th><th>Images</th>{data.classes.map((c) => <th key={c}>{c}</th>)}</tr></thead>
          <tbody>
            {Object.entries(data.splits).map(([name, list]) => (
              <tr key={name}><td>{name}</td><td>{list.length}</td>{data.classes.map((c) => <td key={c}>{count(list, c)}</td>)}</tr>
            ))}
          </tbody>
        </table>
        <p className="out">Numbers under each class are labeled boxes. Sources: Open Images V7 and Roboflow Universe, CC BY images only.</p>
      </section>

      <section>
        <h2>Datasets in the training set</h2>
        <table>
          <thead><tr><th>Dataset</th><th>Images</th><th>License</th><th /></tr></thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td><td>{s.images}</td><td>{s.license}</td>
                <td><button onClick={() => void removeSource(s.id, s.name, s.images)}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {note && <p className="out">{note}</p>}
      </section>

      <section>
        <p>
          {Object.keys(data.splits).map((s) => (
            <button key={s} onClick={() => { setSplit(s); setLimit(PAGE); }} disabled={s === split}>{s}</button>
          ))}{" "}
          <select value={cls} onChange={(e) => { setCls(e.target.value); setLimit(PAGE); }} aria-label="Class filter">
            <option value="all">all classes</option>
            {data.classes.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>{" "}
          <label><input type="checkbox" checked={showBoxes} onChange={(e) => setShowBoxes(e.target.checked)} /> Show labels</label>
        </p>
        <p className="out">{items.length} images in {split}{cls !== "all" && ` containing ${cls}`}.</p>
        <div className="grid">
          {items.slice(0, limit).map((item) => (
            <figure key={item.file}>
              <div style={{ position: "relative" }}>
                <img src={`/api/dataimage?split=${split}&name=${encodeURIComponent(item.file)}`} alt={item.file} loading="lazy" style={{ width: "100%", display: "block" }} />
                {showBoxes && <Overlay boxes={item.boxes} color="#1b8a3a" />}
              </div>
              <figcaption>
                {[...new Set(item.boxes.map((b) => b.name))].join(", ")}
                <br />
                <a href={item.source} target="_blank" rel="noreferrer">{item.author || "unknown author"}</a>, CC BY
              </figcaption>
            </figure>
          ))}
        </div>
        {limit < items.length && <p><button onClick={() => setLimit(limit + PAGE)}>Show more ({items.length - limit} left)</button></p>}
      </section>
    </>
  );
}
