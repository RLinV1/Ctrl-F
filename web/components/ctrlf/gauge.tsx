"use client";

import { animate } from "animejs";
import { useRef } from "react";
import { useAnime } from "@/lib/motion/use-anime";
import { cn } from "@/lib/utils";

const SWEEP = 120; // degrees from the left stop to the right stop

/**
 * A small dial whose needle points at `value` (0 to 1). Meaningful only beside the
 * words it illustrates: the status line or the confidence figure always says it too.
 */
export function Gauge({ value, label, className }: { value: number; label: string; className?: string }) {
  const root = useRef<SVGSVGElement>(null);
  const angle = -SWEEP / 2 + Math.min(1, Math.max(0, value)) * SWEEP;
  useAnime(
    root,
    ({ reduced }) => {
      animate("[data-needle]", { rotate: angle, duration: reduced ? 0 : 700, ease: "outElastic(1, .7)" });
    },
    [angle],
  );
  const ticks = Array.from({ length: 7 }, (_, i) => -SWEEP / 2 + (i * SWEEP) / 6);
  return (
    <svg aria-label={label} className={cn("h-7 w-11", className)} ref={root} role="img" viewBox="-22 -20 44 24">
      <path d="M-18 0 A18 18 0 0 1 18 0" fill="none" stroke="var(--rule)" strokeWidth="3" />
      {ticks.map((t) => (
        <line
          key={t}
          stroke="var(--ink-muted)"
          strokeWidth="1"
          transform={`rotate(${t})`}
          x1="0"
          x2="0"
          y1="-18"
          y2="-14"
        />
      ))}
      <g data-needle style={{ transform: `rotate(${-SWEEP / 2}deg)` }}>
        <line stroke="var(--ink)" strokeLinecap="square" strokeWidth="2" x1="0" x2="0" y1="0" y2="-16" />
      </g>
      <circle fill="var(--brass)" r="3" />
    </svg>
  );
}
