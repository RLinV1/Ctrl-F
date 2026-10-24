"use client";

import { useEffect, useState } from "react";
import SplitFlapText from "@/components/kokonutui/split-flap-text";
import { exactTime, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * "12 min ago" on a split-flap board that flips only when the words change, with the
 * exact time shown on hover and on keyboard focus. Starts from the server's `now`, so
 * the first paint matches the server render, then keeps time every 30 s.
 */
export function LastSeen({ iso, now, className }: { iso: string; now: number; className?: string }) {
  const [clock, setClock] = useState(now);
  useEffect(() => {
    const id = window.setInterval(() => setClock(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const words = relativeTime(iso, clock);
  const exact = exactTime(iso);
  return (
    <time
      aria-label={`${words}, ${exact}`}
      className={cn("group relative inline-flex outline-offset-4", className)}
      dateTime={iso}
      tabIndex={0}
    >
      <SplitFlapText announce={false} className="text-[19px]" length={11} text={words} />
      <span
        aria-hidden
        className="pointer-events-none absolute top-full left-0 z-10 mt-1.5 whitespace-nowrap bg-ink px-2 py-1 text-paper text-xs opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
      >
        {exact}
      </span>
    </time>
  );
}
