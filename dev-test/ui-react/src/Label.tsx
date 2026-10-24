import { useEffect, useRef, useState } from "react";
import { readJson } from "./api";
import { Box, Overlay } from "./Results";

type Item = { file: string; labeled: boolean; boxes: Box[] };
type Point = { x: number; y: number };

const clamp = (n: number) => Math.min(Math.max(n, 0), 1);

// Make our own training data: upload photos (one, many, or a whole folder), draw a box around each item, pick its
// class, save. Saved labels land in training/datasets/mine/ as YOLO files; training/import_own.py adds them to the
// training set. A photo saved with no boxes counts as "none of our items here" and trains the model to ignore it.
export default function Label() {
  const [classes, setClasses] = useState<string[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [cls, setCls] = useState(0);
  const [drag, setDrag] = useState<{ from: Point; to: Point } | null>(null);
  const [onlyUnlabeled, setOnlyUnlabeled] = useState(false);
  const [cropping, setCropping] = useState(false); // drag draws the crop area instead of a label box
  const [crop, setCrop] = useState<Box["box"] | null>(null);
  const [version, setVersion] = useState(0); // bumped when a photo is rotated or cropped, so the browser reloads it
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const stage = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ w: 0, h: 0 });
  const [natural, setNatural] = useState({ w: 1, h: 1 });
  const [zoom, setZoom] = useState(1); // 1 = the whole photo fits the viewport
  const zoomRef = useRef(1);
  zoomRef.current = zoom;

  // Zoom around a screen point (the cursor, or the viewport center for the buttons) so that point stays put.
  function zoomBy(factor: number, cx?: number, cy?: number) {
    const el = viewport.current, st = stage.current;
    if (!el || !st) return;
    const r = st.getBoundingClientRect(), v = el.getBoundingClientRect();
    cx ??= v.left + v.width / 2;
    cy ??= v.top + v.height / 2;
    const fx = (cx - r.left) / r.width, fy = (cy - r.top) / r.height;
    setZoom(Math.min(Math.max(zoomRef.current * factor, 0.25), 8));
    requestAnimationFrame(() => {
      const r2 = st.getBoundingClientRect();
      el.scrollLeft += r2.left + fx * r2.width - cx!;
      el.scrollTop += r2.top + fy * r2.height - cy!;
    });
  }

  // Track the viewport size (the fit size depends on it) and let ctrl/cmd + wheel zoom. React's onWheel is passive,
  // so the wheel listener is added by hand to be able to stop the page from zooming too.
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setView({ w: el.clientWidth, h: el.clientHeight }));
    observer.observe(el);
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX, e.clientY);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => { observer.disconnect(); el.removeEventListener("wheel", onWheel); };
  }, [current]);
  const fitWidth = view.w ? Math.min(view.w, view.h * (natural.w / natural.h)) : 0;

  async function reload(select?: string) {
    const body = await readJson(await fetch("/api/own/list"));
    if (body.error) return setError(body.error);
    setClasses(body.classes);
    setItems(body.items);
    if (select) open(body.items.find((i: Item) => i.file === select) ?? null);
  }
  useEffect(() => { void reload(); }, []);

  function open(item: Item | null) {
    setCurrent(item?.file ?? null);
    setBoxes(item?.boxes ?? []);
    setCropping(false);
    setCrop(null);
    setZoom(1);
  }

  // Upload files one at a time, so a big batch shows progress and one bad file does not sink the rest.
  async function upload(files: FileList | File[]) {
    const images = [...files].filter((f) => f.type.startsWith("image/"));
    let failed = 0;
    for (const [i, file] of images.entries()) {
      setProgress(`Uploading ${i + 1} of ${images.length}...`);
      try {
        const res = await fetch("/api/own/upload", { method: "POST", body: file });
        if (!res.ok) failed += 1;
      } catch {
        failed += 1;
      }
    }
    setProgress(`Uploaded ${images.length - failed} of ${images.length}${failed ? ` (${failed} failed: not images, or the server is down)` : ""}.`);
    await reload();
  }

  const visible = items.filter((i) => !onlyUnlabeled || !i.labeled);
  const point = (e: React.PointerEvent): Point => {
    const r = stage.current!.getBoundingClientRect();
    return { x: clamp((e.clientX - r.left) / r.width), y: clamp((e.clientY - r.top) / r.height) };
  };
  function finishDrag() {
    if (drag) {
      const box: Box["box"] = [Math.min(drag.from.x, drag.to.x), Math.min(drag.from.y, drag.to.y), Math.max(drag.from.x, drag.to.x), Math.max(drag.from.y, drag.to.y)];
      if (box[2] - box[0] > 0.01 && box[3] - box[1] > 0.01) cropping ? setCrop(box) : setBoxes([...boxes, { cls, name: classes[cls], box }]);
    }
    setDrag(null);
  }

  async function save() {
    if (!current) return;
    const res = await fetch("/api/own/save", { method: "POST", body: JSON.stringify({ file: current, boxes: boxes.map((b) => ({ cls: b.cls, box: b.box })) }) });
    if (!res.ok) return setError((await readJson(res)).error ?? "Save failed");
    setError("");
    const updated = items.map((i) => (i.file === current ? { ...i, labeled: true, boxes } : i));
    setItems(updated);
    const next = updated.find((i) => !i.labeled); // jump to the next photo that still needs labels
    open(next ?? null);
  }

  // Rotate or crop the photo on the server. Your boxes move with it, so nothing needs redrawing.
  async function edit(op: "rotate" | "crop", arg: number | Box["box"]) {
    if (!current) return;
    const res = await fetch("/api/own/edit", { method: "POST", body: JSON.stringify({ file: current, op, arg, boxes: boxes.map((b) => ({ cls: b.cls, box: b.box })) }) });
    const body = await readJson(res);
    if (!res.ok) return setError(body.error ?? "Edit failed");
    setError("");
    setBoxes(body.boxes.map((b: { cls: number; box: Box["box"] }) => ({ ...b, name: classes[b.cls] })));
    setCropping(false);
    setCrop(null);
    setZoom(1);
    setVersion(version + 1);
    await reload();
  }

  async function remove() {
    if (!current || !confirm("Delete this photo and its labels?")) return;
    await fetch("/api/own/delete", { method: "POST", body: JSON.stringify({ file: current }) });
    setCurrent(null);
    setBoxes([]);
    await reload();
  }

  const labeled = items.filter((i) => i.labeled).length;
  const live = drag ? [{ cls, name: classes[cls], box: [Math.min(drag.from.x, drag.to.x), Math.min(drag.from.y, drag.to.y), Math.max(drag.from.x, drag.to.x), Math.max(drag.from.y, drag.to.y)] as Box["box"] }] : [];

  return (
    <>
      <section>
        <h2>Label your own photos</h2>
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); void upload(e.dataTransfer.files); }}
          style={{ border: "2px dashed #999", borderRadius: 8, padding: "1rem" }}
        >
          Drop photos here, or{" "}
          <label><input type="file" accept="image/*" multiple hidden onChange={(e) => e.target.files && void upload(e.target.files)} /><u style={{ cursor: "pointer" }}>choose files</u></label>{" "}
          or{" "}
          <label>
            <input type="file" multiple hidden {...{ webkitdirectory: "" }} onChange={(e) => e.target.files && void upload(e.target.files)} />
            <u style={{ cursor: "pointer" }}>choose a folder</u>
          </label>
          .
        </div>
        {progress && <p className="out">{progress}</p>}
        {error && <p className="err">{error}</p>}
        <p className="out">
          {items.length} photos, {labeled} labeled. Photos are shrunk to 1280 px. When you are done, run{" "}
          <code>python training/import_own.py</code> to add them to the training set.
        </p>
      </section>

      {current && (
        <section>
          <p>
            Class{" "}
            <select value={cls} onChange={(e) => setCls(Number(e.target.value))} aria-label="Class for the next box">
              {classes.map((c, i) => <option key={c} value={i}>{c}</option>)}
            </select>{" "}
            {cropping ? "Drag on the photo to choose the part to keep." : "Drag on the photo to draw a box around one item."}
          </p>
          <p>
            <button onClick={() => zoomBy(1 / 1.25)} aria-label="Zoom out">-</button>{" "}
            <button onClick={() => setZoom(1)}>Fit ({Math.round(zoom * 100)}%)</button>{" "}
            <button onClick={() => zoomBy(1.25)} aria-label="Zoom in">+</button>{" "}
            <span className="out">Ctrl + mouse wheel also zooms. Scroll to move around a zoomed photo.</span>
          </p>
          <div ref={viewport} style={{ height: "70vh", overflow: "auto", background: "#eee", border: "1px solid #ccc" }}>
          <div
            ref={stage}
            style={{ position: "relative", touchAction: "none", cursor: "crosshair", userSelect: "none", margin: "0 auto", width: fitWidth ? fitWidth * zoom : "100%" }}
            onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); const p = point(e); setDrag({ from: p, to: p }); }}
            onPointerMove={(e) => drag && setDrag({ ...drag, to: point(e) })}
            onPointerUp={finishDrag}
          >
            <img src={`/api/own/image?name=${encodeURIComponent(current)}&v=${version}`} alt={current} draggable={false} style={{ width: "100%", display: "block" }}
              onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })} />
            {!cropping && <Overlay boxes={boxes} color="#1b8a3a" />}
            {cropping && crop && <Overlay boxes={[{ cls: 0, name: "crop", box: crop }]} color="#1565c0" />}
            <Overlay boxes={live} color="#d9650b" dashed />
          </div>
          </div>
          <p>
            {boxes.map((b, i) => (
              <span key={i} style={{ marginRight: "0.6rem" }}>
                {b.name} <button onClick={() => setBoxes(boxes.filter((_, j) => j !== i))} aria-label={`Remove ${b.name} box`}>x</button>
              </span>
            ))}
            {boxes.length === 0 && <span className="out">No boxes yet. Save with none if no item of ours is in this photo.</span>}
          </p>
          <p>
            <button onClick={() => void edit("rotate", -90)} disabled={cropping}>Rotate left</button>{" "}
            <button onClick={() => void edit("rotate", 90)} disabled={cropping}>Rotate right</button>{" "}
            {cropping ? (
              <>
                <button onClick={() => crop && void edit("crop", crop)} disabled={!crop}>Apply crop</button>{" "}
                <button onClick={() => { setCropping(false); setCrop(null); }}>Cancel crop</button>{" "}
              </>
            ) : (
              <button onClick={() => setCropping(true)}>Crop</button>
            )}{" "}
            <button onClick={() => void save()} disabled={cropping}>{boxes.length ? "Save labels" : "Save: none of our items"}</button>{" "}
            <button onClick={() => setBoxes([])} disabled={!boxes.length}>Clear boxes</button>{" "}
            <button onClick={() => void remove()}>Delete photo</button>
          </p>
        </section>
      )}

      <section>
        <label><input type="checkbox" checked={onlyUnlabeled} onChange={(e) => setOnlyUnlabeled(e.target.checked)} /> Only photos that still need labels</label>
        <div className="grid" style={{ marginTop: "0.6rem" }}>
          {visible.map((item) => (
            <figure key={item.file} onClick={() => open(item)} style={{ cursor: "pointer", outline: item.file === current ? "3px solid #d9650b" : "none" }}>
              <div style={{ position: "relative" }}>
                <img src={`/api/own/image?name=${encodeURIComponent(item.file)}&v=${item.file === current ? version : 0}`} alt={item.file} loading="lazy" style={{ width: "100%", display: "block" }} />
                <Overlay boxes={item.boxes} color="#1b8a3a" />
              </div>
              <figcaption>{item.labeled ? [...new Set(item.boxes.map((b) => b.name))].join(", ") || "none of our items" : "not labeled"}</figcaption>
            </figure>
          ))}
        </div>
        {visible.length === 0 && <p className="out">Nothing to show yet. Upload some photos above.</p>}
      </section>
    </>
  );
}
