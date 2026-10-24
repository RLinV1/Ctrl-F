import Link from "next/link";
import { Suspense } from "react";
import { requestTime, store } from "@/lib/data";
import type { Item } from "@/lib/data/types";
import { placeWords, relativeTime, timesLost } from "@/lib/format";

export const metadata = { title: "History · Ctrl-F" };

export default function HistoryPage() {
  return (
    <div className="mx-auto max-w-[1100px] px-4 pt-10 pb-16 md:px-8 md:pt-[72px]">
      <h1 className="font-heading font-bold text-[26px] leading-[1.1] tracking-[-0.01em] md:text-[32px]">History</h1>
      <p className="mt-3 text-[17px] text-ink-muted">What the camera saw most recently, and what goes missing most.</p>
      <Suspense fallback={<p className="mt-12 text-ink-muted">Loading history…</p>}>
        <Lists />
      </Suspense>
    </div>
  );
}

function Row({ item, detail }: { item: Item; detail: string }) {
  return (
    <li className="flex min-h-[63px] items-center justify-between gap-3 border border-rule bg-card-row px-3 py-2">
      <Link className="inline-block font-semibold first-letter:uppercase underline-offset-4 hover:underline" href={`/items/${item.id}`}>
        {item.name}
      </Link>
      <span className="figures text-right text-ink-muted text-sm">{detail}</span>
    </li>
  );
}

async function Lists() {
  const items = await (await store()).listItems();
  const now = await requestTime();
  const recent = items.filter((i) => i.lastSeen);
  const lost = items.filter((i) => i.lostCount > 0).sort((a, b) => b.lostCount - a.lostCount);
  return (
    <div className="mt-12 grid items-start gap-4 md:grid-cols-2">
      <section aria-labelledby="recent-title" className="bg-panel p-5">
        <h2 className="font-semibold text-[15px]" id="recent-title">
          Recently seen
        </h2>
        {recent.length ? (
          <ul className="mt-4 space-y-2">
            {recent.map((item) => (
              <Row
                detail={`${placeWords(item.lastSeen!.zone) ?? "unmarked spot"}, ${relativeTime(item.lastSeen!.seenAt, now)}`}
                item={item}
                key={item.id}
              />
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-ink-muted">Nothing seen yet.</p>
        )}
      </section>
      <section aria-labelledby="lost-title" className="bg-panel p-5">
        <h2 className="font-semibold text-[15px]" id="lost-title">
          Lost most often
        </h2>
        {lost.length ? (
          <ul className="mt-4 space-y-2">
            {lost.map((item) => (
              <Row detail={timesLost(item.lostCount)} item={item} key={item.id} />
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-ink-muted">Nothing has gone missing yet.</p>
        )}
      </section>
    </div>
  );
}
