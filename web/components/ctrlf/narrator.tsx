"use client";

import { animate } from "animejs";
import { useRef } from "react";
import { useAnime } from "@/lib/motion/use-anime";
import { cn } from "@/lib/utils";

/*
 * The narrator: the steampunk detective whose voice (ElevenLabs) reads every answer.
 * He stands in the bottom-right corner of the Ask page and comes alive while a
 * reply plays; `speaking` follows the reply's audio.
 */

export function Narrator({ speaking, className }: { speaking: boolean; className?: string }) {
  const root = useRef<HTMLElement>(null);
  useAnime(
    root,
    ({ reduced }) => {
      if (!speaking || reduced) return;
      // A small nod while he talks; the scope reverts it the moment he stops.
      animate("[data-narrator]", {
        translateY: [0, -3, 0],
        rotate: [0, -1.2, 0],
        duration: 520,
        ease: "inOutSine",
        loop: true,
      });
    },
    [speaking],
  );

  return (
    <figure className={cn("relative", className)} data-speaking={speaking || undefined} ref={root}>
      <figcaption aria-live="polite" className="mb-1 pr-3 text-right text-ink-muted text-sm">
        {speaking ? (
          <span className="font-semibold text-ink">Speaking…</span>
        ) : (
          "Ask, and I shall read you the answer."
        )}
      </figcaption>
      {/* eslint-disable-next-line @next/next/no-img-element -- a transparent PNG; the optimiser is off locally */}
      <img
        alt="The narrator, a detective in a deerstalker with brass goggles and a pipe"
        className="block h-auto w-full origin-bottom"
        data-narrator
        decoding="async"
        height={400}
        src="/narrator.png"
        width={400}
      />
    </figure>
  );
}
