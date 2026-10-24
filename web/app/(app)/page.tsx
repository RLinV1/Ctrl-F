import { Suspense } from "react";
import { AskPanel } from "@/components/ctrlf/ask-panel";
import { requestTime, store } from "@/lib/data";
import { partOfDay, placeWords, relativeTime } from "@/lib/format";

export default function AskPage() {
  return (
    <div className="mx-auto max-w-[1100px] px-4 pt-10 pb-16 md:px-8 md:pt-[72px]">
      <Suspense fallback={<Greeting />}>
        <Overview />
      </Suspense>
      <div className="mt-10">
        <AskPanel />
      </div>
    </div>
  );
}

function Greeting({ fact }: { fact?: string }) {
  return (
    <>
      <h1 className="font-heading font-bold text-[32px] leading-[1.05] tracking-[-0.02em] md:text-[48px]">
        {fact === undefined ? "Ctrl-F" : greetingNow()}
      </h1>
      <p className="mt-3 text-[17px] text-ink-muted">{fact ?? "Checking what the camera has seen…"}</p>
    </>
  );
}

function greetingNow() {
  return `${partOfDay(new Date().getHours())}.`;
}

async function Overview() {
  const items = await (await store()).listItems();
  const now = await requestTime();
  const newest = items.find((i) => i.lastSeen);
  const fact = newest?.lastSeen
    ? `The ${newest.name} was the last thing seen, ${relativeTime(newest.lastSeen.seenAt, now)}${
        newest.lastSeen.zone ? ` on ${placeWords(newest.lastSeen.zone)}` : ""
      }.`
    : "Nothing has been seen yet. Point the camera at the room and ask.";
  return <Greeting fact={fact} />;
}
