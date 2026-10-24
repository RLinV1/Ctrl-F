import { useState } from "react";
import Camera from "./Camera";
import Dataset from "./Dataset";
import Mic from "./Mic";
import Results from "./Results";

// Throwaway test UI. Delete dev-test/ when the real web app exists.
// No manual text-to-speech panel: Gemini decides the reply, then ElevenLabs voices it.
export default function App() {
  const [tab, setTab] = useState<"live" | "data" | "model">("live");
  return (
    <>
      <h1>Ctrl-F dev test</h1>
      <p>
        <button onClick={() => setTab("live")} disabled={tab === "live"}>Mic and camera</button>{" "}
        <button onClick={() => setTab("data")} disabled={tab === "data"}>Labeled dataset</button>{" "}
        <button onClick={() => setTab("model")} disabled={tab === "model"}>Model results</button>
      </p>
      {tab === "live" && (
        <>
          <Mic />
          <Camera />
        </>
      )}
      {tab === "data" && <Dataset />}
      {tab === "model" && <Results />}
    </>
  );
}
