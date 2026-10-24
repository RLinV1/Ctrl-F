"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useState } from "react";
import type { Item, JobView, Sighting } from "@/lib/data/types";
import { clockTime, percent, placeWords, relativeTime } from "@/lib/format";
import { SnapshotFrame } from "./snapshot-frame";

/**
 * The camera's photo, below the Ask box. Before a question it shows the latest photo;
 * once answered, the photo the camera took with the target circled in brass, or the
 * item's last photo when it is not in view now.
 */
export function CameraView({ answer, answeredAt, working }: { answer: JobView | null; answeredAt: number; working: boolean }) {
  const latest = useLatestPhoto();
  const name = answer?.target ?? "item";

  let body: ReactNode;
  if (answer?.found && answer.match) {
    const m = answer.match;
    const place = placeWords(m.zone);
    body = (
      <Photo
        caption={
          <>
            <span className="font-semibold first-letter:uppercase">{name}</span>
            <span>{place ? `On ${place}` : "Place not marked"}</span>
            <span className="figures text-ink-muted">{percent(m.confidence)} sure</span>
            <span className="figures text-ink-muted">Photo at {clockTime(m.seenAt)}</span>
          </>
        }
        sighting={m}
        alt={`Camera photo with the ${name} circled`}
        lens={name}
        testId="found"
      />
    );
  } else if (answer?.lastSighting) {
    const s = answer.lastSighting;
    const place = placeWords(s.zone);
    body = (
      <Photo
        alt={`Last photo with the ${name}, ${relativeTime(s.seenAt, answeredAt)}`}
        caption={
          <>
            <span className="font-semibold">Not in view right now</span>
            <span>
              Last seen {relativeTime(s.seenAt, answeredAt)}
              {place ? ` on ${place}` : ""}
            </span>
            {answer.itemId && (
              <Link className="underline underline-offset-4" href={`/items/${answer.itemId}`}>
                See where the {name} {name.endsWith("s") ? "have" : "has"} been
              </Link>
            )}
          </>
        }
        lens={name}
        sighting={s}
        testId="not-found"
      />
    );
  } else if (answer) {
    body = (
      <>
        {latest && <Photo alt="Latest camera photo" sighting={latest.photo} />}
        <p className="mt-3 text-[15px]" data-testid="never-seen">
          The camera has not seen the {name} yet. Put it somewhere in view and it will be remembered.
        </p>
      </>
    );
  } else if (latest) {
    body = (
      <Photo
        alt="Latest camera photo"
        caption={
          <span className="text-ink-muted">
            {working
              ? "Taking a new photo…"
              : `Latest photo, ${relativeTime(latest.photo.seenAt, latest.at)}. Ask, and the item you name is circled here.`}
          </span>
        }
        sighting={latest.photo}
      />
    );
  } else {
    body = <p className="text-ink-muted">No photo from the camera yet.</p>;
  }

  return (
    <section aria-labelledby="camera-title" className="bg-panel p-5" data-testid="camera-view">
      <h2 className="font-semibold text-[15px]" id="camera-title">
        Camera view
      </h2>
      <div className="mt-4">{body}</div>
    </section>
  );
}

function Photo({
  sighting,
  alt,
  lens,
  caption,
  testId,
}: {
  sighting: Sighting;
  alt: string;
  lens?: string;
  caption?: ReactNode;
  testId?: string;
}) {
  return (
    <figure data-testid={testId}>
      <SnapshotFrame
        alt={alt}
        height={sighting.snapshot.height}
        key={`${sighting.snapshot.id}-${lens ?? ""}`}
        lens={lens ? { box: sighting.box, label: lens, confidence: sighting.confidence } : null}
        priority
        src={sighting.snapshot.url}
        width={sighting.snapshot.width}
      />
      {caption && <figcaption className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[15px]">{caption}</figcaption>}
    </figure>
  );
}

/** The newest photo any tracked item was seen in, fetched once. */
function useLatestPhoto() {
  const [latest, setLatest] = useState<{ photo: Sighting; at: number } | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/items", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((items: Item[]) => {
        const photo = items
          .map((i) => i.lastSeen)
          .filter((s): s is Sighting => s !== null)
          .sort((a, b) => Date.parse(b.seenAt) - Date.parse(a.seenAt))[0];
        if (alive && photo) setLatest({ photo, at: Date.now() });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return latest;
}
