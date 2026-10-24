import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { HistoryView } from "@/components/ctrlf/history-view";
import { requestTime, store } from "@/lib/data";
import { HISTORY_PAGE_SIZE } from "@/lib/data/store";
import { placeWords, relativeTime, timesLost } from "@/lib/format";

export default function ItemHistoryPage({ params }: PageProps<"/items/[id]">) {
  return (
    <div className="mx-auto max-w-[1100px] px-4 pt-10 pb-16 md:px-8 md:pt-[72px]">
      <Link className="text-ink-muted text-sm underline-offset-4 hover:text-ink hover:underline" href="/items">
        All items
      </Link>
      <Suspense fallback={<p className="mt-6 text-ink-muted">Loading history…</p>}>
        <History params={params} />
      </Suspense>
    </div>
  );
}

async function History({ params }: { params: PageProps<"/items/[id]">["params"] }) {
  const { id } = await params;
  const data = await store();
  const [item, sightings] = await Promise.all([data.getItem(id), data.itemSightings(id, { limit: HISTORY_PAGE_SIZE })]);
  if (!item || !sightings) notFound();
  const now = await requestTime();
  const seen = item.lastSeen;
  return (
    <>
      <h1 className="mt-3 font-heading font-bold text-[26px] first-letter:uppercase leading-[1.1] tracking-[-0.01em] md:text-[32px]">
        {item.name}
      </h1>
      <p className="mt-3 text-[17px] text-ink-muted">
        {seen
          ? `Last seen ${relativeTime(seen.seenAt, now)}${seen.zone ? ` on ${placeWords(seen.zone)}` : ""}. `
          : "Not seen yet. "}
        <span className="figures">{capitalise(timesLost(item.lostCount))}.</span>
      </p>
      <HistoryView initial={sightings} itemId={item.id} name={item.name} now={now} />
    </>
  );
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
