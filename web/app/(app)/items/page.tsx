import Link from "next/link";
import { Suspense } from "react";
import { LastSeen } from "@/components/ctrlf/last-seen";
import { SnapshotFrame } from "@/components/ctrlf/snapshot-frame";
import { requestTime, store } from "@/lib/data";
import type { Item } from "@/lib/data/types";
import { exactTime, placeWords, relativeTime, timesLost } from "@/lib/format";

export const metadata = { title: "Items · Ctrl-F" };

export default function ItemsPage() {
  return (
    <div className="mx-auto max-w-[1100px] px-4 pt-10 pb-16 md:px-8 md:pt-[72px]">
      <h1 className="font-heading font-bold text-[26px] leading-[1.1] tracking-[-0.01em] md:text-[32px]">
        Where everything was last seen
      </h1>
      <Suspense fallback={<ItemsSkeleton />}>
        <ItemList />
      </Suspense>
    </div>
  );
}

async function ItemList() {
  const items = await (await store()).listItems();
  const now = await requestTime();
  if (items.length === 0) {
    return (
      <section className="mt-12 bg-panel p-5">
        <h2 className="font-semibold text-[15px]">Nothing tracked yet</h2>
        <p className="mt-1 max-w-[60ch] text-ink-muted">
          Items come from the classes the camera&apos;s model is trained on. Once the model is loaded, each item it can
          recognise appears here with the last place it was seen.
        </p>
      </section>
    );
  }

  const missing = items.filter((i) => !i.lastSeen || now - Date.parse(i.lastSeen.seenAt) > 60 * 60_000);
  const mostLost = [...items].sort((a, b) => b.lostCount - a.lostCount)[0];
  const finding =
    mostLost.lostCount > 0
      ? `Lost most often: the ${mostLost.name}, ${mostLost.lostCount} times.`
      : "Nothing has gone missing yet.";

  return (
    <>
      <p className="mt-3 max-w-[70ch] text-[17px] text-ink-muted">
        {items.length} items tracked, {missing.length} not seen in the last hour. {finding}
      </p>

      <div className="mt-12 grid items-start gap-4 lg:grid-cols-12">
        <section aria-labelledby="items-title" className="bg-panel p-5 lg:col-span-7">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="font-semibold text-[15px]" id="items-title">
              Items
            </h2>
            <p className="text-ink-muted text-sm">Newest sighting first</p>
          </div>
          <ul className="mt-4 space-y-2">
            {items.map((item) => {
              const seen = item.lastSeen;
              const place = seen ? placeWords(seen.zone) : null;
              return (
                <li className="border border-rule bg-card-row" data-item={item.name} key={item.id}>
                  <div className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-x-4 gap-y-2 p-3 sm:grid-cols-[120px_minmax(0,1fr)]">
                    <div className="row-span-2">
                      {seen ? (
                        <SnapshotFrame
                          alt={`${item.name} ${relativeTime(seen.seenAt, now)}`}
                          height={seen.snapshot.height}
                          lens={{ box: seen.box, label: item.name }}
                          src={seen.snapshot.url}
                          width={seen.snapshot.width}
                        />
                      ) : (
                        <div className="flex aspect-video items-center justify-center bg-panel text-ink-muted text-xs">
                          No photo yet
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <Link
                        className="inline-block font-semibold text-[17px] first-letter:uppercase underline-offset-4 hover:underline"
                        href={`/items/${item.id}`}
                      >
                        {item.name}
                      </Link>
                      <p className="mt-0.5 text-ink-muted text-sm">
                        {seen ? (place ? `On ${place}` : "Place not marked") : "Not seen yet"} ·{" "}
                        <span className="figures">{timesLost(item.lostCount)}</span>
                      </p>
                    </div>
                    <div>
                      {seen ? (
                        <LastSeen iso={seen.seenAt} now={now} />
                      ) : (
                        <span className="text-ink-muted text-sm">not seen yet</span>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
        <LatestPhoto items={items} now={now} />
      </div>
    </>
  );
}

/** The newest camera photo, with every tracked item seen in it marked and named. */
function LatestPhoto({ items, now }: { items: Item[]; now: number }) {
  const newest = items
    .map((i) => i.lastSeen)
    .filter((s): s is NonNullable<typeof s> => s !== null)
    .sort((a, b) => Date.parse(b.seenAt) - Date.parse(a.seenAt))[0];
  if (!newest) return null;
  const inShot = items.filter((i) => i.lastSeen?.snapshot.id === newest.snapshot.id);
  return (
    <section aria-labelledby="latest-title" className="bg-panel p-5 lg:sticky lg:top-6 lg:col-span-5">
      <h2 className="font-semibold text-[15px]" id="latest-title">
        Latest photo
      </h2>
      <p className="mt-0.5 text-ink-muted text-sm">
        {exactTime(newest.seenAt)}, {relativeTime(newest.seenAt, now)}
      </p>
      <SnapshotFrame
        alt={`Latest camera photo showing ${inShot.map((i) => i.name).join(", ")}`}
        className="mt-4"
        height={newest.snapshot.height}
        marks={inShot.map((i) => ({ box: i.lastSeen!.box, label: i.name }))}
        src={newest.snapshot.url}
        width={newest.snapshot.width}
      />
      <ul className="mt-4 space-y-1 text-[15px]">
        {inShot.map((i) => (
          <li className="flex justify-between gap-3" key={i.id}>
            <span className="first-letter:uppercase">{i.name}</span>
            <span className="text-ink-muted">{placeWords(i.lastSeen!.zone) ?? "unmarked spot"}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ItemsSkeleton() {
  return (
    <section aria-busy className="mt-12 bg-panel p-5">
      <p className="text-ink-muted">Loading items…</p>
    </section>
  );
}
