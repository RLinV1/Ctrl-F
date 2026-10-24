import Link from "next/link";
import { Suspense } from "react";
import { AskPanel } from "@/components/ctrlf/ask-panel";
import { requestTime, store } from "@/lib/data";
import type { Item } from "@/lib/data/types";
import { partOfDay, placeWords, relativeTime, timesLost } from "@/lib/format";

const HOUR = 60 * 60_000;

export default function AskPage() {
  return (
    <div className="mx-auto max-w-[1100px] px-4 pt-10 pb-16 md:px-8 md:pt-[72px]">
      <Suspense fallback={<OverviewFallback />}>
        <Overview />
      </Suspense>
      <div className="mt-4">
        <AskPanel />
      </div>
      <Suspense fallback={null}>
        <Lists />
      </Suspense>
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

/** Same size as the overview, so the Ask panel does not move when the data streams in. */
function OverviewFallback() {
  return (
    <>
      <Greeting />
      <ul aria-hidden className="mt-[50px] grid grid-cols-2 gap-4 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <li className="min-h-[128px] bg-panel" key={i} />
        ))}
      </ul>
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

  const seenHour = items.filter((i) => i.lastSeen && now - Date.parse(i.lastSeen.seenAt) <= HOUR).length;
  const neverSeen = items.filter((i) => !i.lastSeen).length;
  const lost = items.reduce((sum, i) => sum + i.lostCount, 0);
  const tiles = [
    { label: "Items tracked", value: items.length, note: "Everything the camera can recognise" },
    { label: "Seen in the last hour", value: seenHour, note: "Spotted in a photo since an hour ago" },
    { label: "Not seen yet", value: neverSeen, note: neverSeen ? "Put these somewhere in view" : "Every item has been seen" },
    { label: "Times asked and missing", value: lost, note: "Not in view when you asked" },
  ];

  return (
    <>
      <Greeting fact={fact} />
      <ul className="mt-[50px] grid grid-cols-2 gap-4 md:grid-cols-4">
        {tiles.map((t) => (
          <li className="flex min-h-[128px] flex-col bg-panel p-4" key={t.label}>
            <span className="text-ink-muted text-sm">{t.label}</span>
            <span className="figures mt-1 text-[32px] leading-none">{t.value}</span>
            <span className="mt-auto pt-2 text-ink-muted text-sm">{t.note}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

function Row({ item, now, detail }: { item: Item; now: number; detail: string }) {
  return (
    <li className="flex min-h-[63px] items-center justify-between gap-3 border border-rule bg-card-row px-3 py-2">
      <Link className="inline-block font-semibold first-letter:uppercase underline-offset-4 hover:underline" href={`/items/${item.id}`}>
        {item.name}
      </Link>
      <span className="figures text-right text-ink-muted text-sm">
        {detail}
        {item.lastSeen && detail === "" ? relativeTime(item.lastSeen.seenAt, now) : ""}
      </span>
    </li>
  );
}

async function Lists() {
  const items = await (await store()).listItems();
  const now = await requestTime();
  const recent = items.filter((i) => i.lastSeen).slice(0, 4);
  const lost = [...items].filter((i) => i.lostCount > 0).sort((a, b) => b.lostCount - a.lostCount).slice(0, 4);
  return (
    <div className="mt-4 grid gap-4 md:grid-cols-2">
      <section aria-labelledby="recent-title" className="bg-panel p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold text-[15px]" id="recent-title">
            Recently seen
          </h2>
          <Link className="text-sm underline-offset-4 hover:underline" href="/items">
            View all
          </Link>
        </div>
        {recent.length ? (
          <ul className="mt-4 space-y-2">
            {recent.map((item) => (
              <Row
                detail={`${placeWords(item.lastSeen!.zone) ?? "unmarked spot"}, ${relativeTime(item.lastSeen!.seenAt, now)}`}
                item={item}
                key={item.id}
                now={now}
              />
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-ink-muted">Nothing seen yet.</p>
        )}
      </section>
      <section aria-labelledby="lost-title" className="bg-panel p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold text-[15px]" id="lost-title">
            Lost most often
          </h2>
          <Link className="text-sm underline-offset-4 hover:underline" href="/items">
            View all
          </Link>
        </div>
        {lost.length ? (
          <ul className="mt-4 space-y-2">
            {lost.map((item) => (
              <Row detail={timesLost(item.lostCount)} item={item} key={item.id} now={now} />
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-ink-muted">Nothing has gone missing yet.</p>
        )}
      </section>
    </div>
  );
}
