"use client";

import { useState } from "react";
import ContactSheet, { type ContactFrame } from "@/components/kokonutui/contact-sheet";
import { HISTORY_PAGE_SIZE as HISTORY_PAGE } from "@/lib/data/store";
import type { Sighting } from "@/lib/data/types";
import { exactTime, percent, placeWords, relativeTime } from "@/lib/format";
import { Gauge } from "./gauge";
import { SnapshotFrame } from "./snapshot-frame";

const toFrame = (name: string, s: Sighting): ContactFrame => ({
  id: s.id,
  src: s.snapshot.url,
  alt: `${name} on ${placeWords(s.zone) ?? "an unmarked spot"}`,
  box: s.box,
  edge: `${exactTime(s.seenAt)}${s.zone ? ` · ${s.zone}` : ""}`,
});

/** The chosen sighting large, with the item's earlier sightings on film strips below it. */
export function HistoryView({
  itemId,
  name,
  initial,
  now,
}: {
  itemId: string;
  name: string;
  initial: Sighting[];
  now: number;
}) {
  const [sightings, setSightings] = useState(initial);
  const [selectedId, setSelectedId] = useState(initial[0]?.id);
  const [more, setMore] = useState(initial.length === HISTORY_PAGE);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const selected = sightings.find((s) => s.id === selectedId) ?? sightings[0];
  if (!selected) {
    return (
      <section className="mt-12 bg-panel p-5">
        <h2 className="font-semibold text-[15px]">No sightings yet</h2>
        <p className="mt-1 text-ink-muted">
          The camera has not seen the {name} yet. Put it somewhere in view and it will be remembered.
        </p>
      </section>
    );
  }

  const loadOlder = async () => {
    setLoading(true);
    setFailed(false);
    try {
      const last = sightings.at(-1)!;
      const res = await fetch(
        `/api/items/${itemId}/sightings?limit=${HISTORY_PAGE}&before=${encodeURIComponent(last.seenAt)}`,
      );
      if (!res.ok) throw new Error(String(res.status));
      const older: Sighting[] = await res.json();
      setSightings((s) => [...s, ...older]);
      setMore(older.length === HISTORY_PAGE);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  const place = placeWords(selected.zone);
  return (
    <>
      <section aria-labelledby="selected-title" className="mt-12 grid gap-4 md:grid-cols-12">
        <div className="md:col-span-9">
          <SnapshotFrame
            alt={`${name} on ${place ?? "an unmarked spot"}, ${exactTime(selected.seenAt)}`}
            height={selected.snapshot.height}
            key={selected.id}
            lens={{ box: selected.box, label: name, confidence: selected.confidence }}
            priority
            src={selected.snapshot.url}
            width={selected.snapshot.width}
          />
        </div>
        <div className="bg-panel p-5 md:col-span-3">
          <h2 className="font-semibold text-[15px]" id="selected-title">
            {selected.id === sightings[0].id ? "Newest sighting" : "Sighting"}
          </h2>
          <dl className="mt-4 space-y-4 text-[15px]">
            <div>
              <dt className="text-ink-muted text-sm">When</dt>
              <dd className="figures">{exactTime(selected.seenAt)}</dd>
              <dd className="text-ink-muted text-sm">{relativeTime(selected.seenAt, now)}</dd>
            </div>
            <div>
              <dt className="text-ink-muted text-sm">Where</dt>
              <dd className="capitalize">{selected.locationDescription || selected.zone || "Place not marked"}</dd>
            </div>
            <div>
              <dt className="text-ink-muted text-sm">Confidence</dt>
              <dd className="flex items-center gap-2">
                {selected.confidence != null && <Gauge label={`Confidence ${percent(selected.confidence ?? 0)}`} value={selected.confidence} />}
                {selected.confidence != null ? <span className="figures">{percent(selected.confidence)}</span> : <span>Not supplied</span>}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <section aria-labelledby="earlier-title" className="mt-10 bg-panel p-5">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-semibold text-[15px]" id="earlier-title">
            Every sighting
          </h2>
          <p className="figures text-ink-muted text-sm">{sightings.length} shown, newest first</p>
        </div>
        <ContactSheet
          className="mt-2"
          frames={sightings.map((s) => toFrame(name, s))}
          onSelect={(f) => setSelectedId(f.id)}
          selectedId={selected.id}
        />
        <div className="mt-4 flex items-center gap-4">
          {more ? (
            <button
              className="h-9 bg-ink px-4 text-paper text-sm transition-colors hover:bg-ink/85 disabled:opacity-60"
              disabled={loading}
              onClick={loadOlder}
              type="button"
            >
              {loading ? "Loading…" : "Load older sightings"}
            </button>
          ) : (
            <p className="text-ink-muted text-sm">That is every sighting on record.</p>
          )}
          {failed && <p className="text-copper text-sm">Could not load older sightings. Try again.</p>}
        </div>
      </section>
    </>
  );
}
