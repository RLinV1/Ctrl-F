import { AskPanel } from "@/components/ctrlf/ask-panel";

export default function AskPage() {
  return (
    <div className="mx-auto max-w-[1100px] px-4 pt-6 md:px-8 md:pt-10">
      <h1 className="sr-only">Ask where something is</h1>
      <AskPanel />
    </div>
  );
}
