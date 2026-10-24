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
type Listing = { classes: string[]; splits: Record<string, Item[]>; review: Record<string, boolean> };

const PAGE = 60;

// Browse every labeled training image: pick a split and a class, see the human-drawn boxes.
export default function Dataset() {
  const [data, setData] = useState<Listing | null>(null);
  const [error, setError] = useState("");
  const [split, setSplit] = useState("train");
  const [cls, setCls] = useState("phone"); // phones only for now
  const [show, setShow] = useState<"all" | "undecided" | "yes" | "no">("undecided");
  const [showBoxes, setShowBoxes] = useState(true);
  const [limit, setLimit] = useState(PAGE);

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
  const vote = (file: string) => data.review[`${split}/${file}`];
  const items = data.splits[split]
    .filter((i) => cls === "all" || i.boxes.some((b) => b.name === cls))
    .filter((i) => show === "all" || (show === "undecided" ? vote(i.file) === undefined : vote(i.file) === (show === "yes")));

  // keep = true (use it), false (drop it), null (undo). Saved on the server in datasets/personal/review.json.
  function decide(file: string, keep: boolean | null) {
    const key = `${split}/${file}`;
    const review = { ...data!.review };
    keep === null ? delete review[key] : (review[key] = keep);
    setData({ ...data!, review });
    fetch("/api/review", { method: "POST", body: JSON.stringify({ key, keep }) }).catch((err: Error) => setError(err.message));
  }
  const tally = Object.values(data.review);

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
        <p className="out">Numbers under each class are labeled boxes. Source: Open Images V7, CC BY images only.</p>
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
          <select value={show} onChange={(e) => { setShow(e.target.value as typeof show); setLimit(PAGE); }} aria-label="Review filter">
            <option value="undecided">not reviewed</option>
            <option value="yes">approved</option>
            <option value="no">rejected</option>
            <option value="all">all</option>
          </select>{" "}
          <label><input type="checkbox" checked={showBoxes} onChange={(e) => setShowBoxes(e.target.checked)} /> Show labels</label>
        </p>
        <p className="out">Reviewed so far: {tally.filter(Boolean).length} yes, {tally.filter((v) => !v).length} no.</p>
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
                <br />
                <button onClick={() => decide(item.file, true)} disabled={vote(item.file) === true}>Yes</button>{" "}
                <button onClick={() => decide(item.file, false)} disabled={vote(item.file) === false}>No</button>{" "}
                {vote(item.file) !== undefined && <button onClick={() => decide(item.file, null)}>Undo</button>}
              </figcaption>
            </figure>
          ))}
        </div>
        {limit < items.length && <p><button onClick={() => setLimit(limit + PAGE)}>Show more ({items.length - limit} left)</button></p>}
      </section>
    </>
  );
}
