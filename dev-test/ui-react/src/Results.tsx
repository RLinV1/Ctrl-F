import { useEffect, useState } from "react";

type Box = { cls: number; name: string; box: [number, number, number, number]; conf?: number };
type ImageResult = { file: string; truth: Box[]; preds: Box[]; tp: number; fp: number; fn: number };
type Report = {
  weights: string;
  split: string;
  conf_threshold: number;
  iou_match: number;
  datasets: Record<string, { images: number; instances: Record<string, number> }>;
  metrics: { map50: number; map50_95: number; per_class: { name: string; precision: number; recall: number; ap50: number }[] };
  images: ImageResult[];
};

const pct = (n: number) => `${Math.round(n * 100)}%`;

function Overlay({ boxes, color, dashed }: { boxes: Box[]; color: string; dashed?: boolean }) {
  return (
    <>
      {boxes.map((b, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: `${b.box[0] * 100}%`,
            top: `${b.box[1] * 100}%`,
            width: `${(b.box[2] - b.box[0]) * 100}%`,
            height: `${(b.box[3] - b.box[1]) * 100}%`,
            border: `2px ${dashed ? "dashed" : "solid"} ${color}`,
            boxSizing: "border-box",
            pointerEvents: "none",
          }}
        >
          <span style={{ position: "absolute", top: 0, left: 0, background: color, color: "#fff", fontSize: 11, padding: "0 3px" }}>
            {b.name}
            {b.conf !== undefined && ` ${pct(b.conf)}`}
          </span>
        </div>
      ))}
    </>
  );
}

// Test images with their human labels (green) and the model's predictions (orange dashed).
export default function Results() {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [showTruth, setShowTruth] = useState(true);
  const [showPreds, setShowPreds] = useState(true);
  const [onlyMistakes, setOnlyMistakes] = useState(false);

  useEffect(() => {
    fetch("/api/report")
      .then(async (res) => (res.ok ? setReport(await res.json()) : setError((await res.json()).error)))
      .catch((err: Error) => setError(err.message));
  }, []);

  if (error) return <section><p className="err">{error}</p></section>;
  if (!report) return <section>Loading report...</section>;

  const totals = report.images.reduce((t, i) => ({ tp: t.tp + i.tp, fp: t.fp + i.fp, fn: t.fn + i.fn }), { tp: 0, fp: 0, fn: 0 });
  const shown = onlyMistakes ? report.images.filter((i) => i.fp + i.fn > 0) : report.images;

  return (
    <>
      <section>
        <h2>Dataset</h2>
        <table>
          <thead>
            <tr><th>Split</th><th>Images</th>{Object.keys(report.datasets.train.instances).map((c) => <th key={c}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {Object.entries(report.datasets).map(([split, d]) => (
              <tr key={split}>
                <td>{split}{split === report.split && " (shown below)"}</td>
                <td>{d.images}</td>
                {Object.values(d.instances).map((n, i) => <td key={i}>{n}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="out">Instances = labeled boxes per class.</p>
      </section>

      <section>
        <h2>How the model did on the {report.split} set</h2>
        <p>
          mAP50 <b>{report.metrics.map50}</b> · mAP50-95 <b>{report.metrics.map50_95}</b> · correct boxes <b>{totals.tp}</b> ·
          false alarms <b>{totals.fp}</b> · missed <b>{totals.fn}</b>
        </p>
        <table>
          <thead><tr><th>Class</th><th>Precision</th><th>Recall</th><th>AP50</th></tr></thead>
          <tbody>
            {report.metrics.per_class.map((c) => (
              <tr key={c.name}><td>{c.name}</td><td>{pct(c.precision)}</td><td>{pct(c.recall)}</td><td>{pct(c.ap50)}</td></tr>
            ))}
          </tbody>
        </table>
        <p className="out">
          Weights: {report.weights}. A prediction counts as correct when it has the right class and overlaps a label by at
          least {pct(report.iou_match)} (IoU); predictions below {pct(report.conf_threshold)} confidence are hidden.
        </p>
      </section>

      <section>
        <h2>Test images ({shown.length})</h2>
        <p>
          <label><input type="checkbox" checked={showTruth} onChange={(e) => setShowTruth(e.target.checked)} /> Labels (green)</label>{" "}
          <label><input type="checkbox" checked={showPreds} onChange={(e) => setShowPreds(e.target.checked)} /> Model (orange)</label>{" "}
          <label><input type="checkbox" checked={onlyMistakes} onChange={(e) => setOnlyMistakes(e.target.checked)} /> Only images with mistakes</label>
        </p>
        <div className="grid">
          {shown.map((img) => (
            <figure key={img.file}>
              <div style={{ position: "relative" }}>
                <img src={`/api/image?name=${encodeURIComponent(img.file)}`} alt={img.file} loading="lazy" style={{ width: "100%", display: "block" }} />
                {showTruth && <Overlay boxes={img.truth} color="#1b8a3a" />}
                {showPreds && <Overlay boxes={img.preds} color="#d9650b" dashed />}
              </div>
              <figcaption>
                {img.tp} correct · {img.fp} false alarm · {img.fn} missed
              </figcaption>
            </figure>
          ))}
        </div>
      </section>
    </>
  );
}
