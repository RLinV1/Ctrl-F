import { AskPanel } from "@/components/ctrlf/ask-panel";

export default function AskPage() {
  return (
    <div className="mx-auto max-w-[1600px] overflow-x-clip px-2 pt-2 md:px-6 md:pt-4">
      <h1 className="sr-only">Ask where something is</h1>
      <AskPanel />
    </div>
  );
}
