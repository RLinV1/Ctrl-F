import Camera from "./Camera";
import Mic from "./Mic";

// Throwaway test UI. Delete dev-test/ when the real web app exists.
// No manual text-to-speech panel: Gemini decides the reply, then ElevenLabs voices it.
export default function App() {
  return (
    <>
      <h1>Ctrl-F dev test</h1>
      <Mic />
      <Camera />
    </>
  );
}
