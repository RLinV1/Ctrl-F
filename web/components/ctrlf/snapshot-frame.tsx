"use client";

import { animate, createDrawable } from "animejs";
import { useRef } from "react";
import type { Box } from "@/lib/data/types";
import { useAnime } from "@/lib/motion/use-anime";
import { cn } from "@/lib/utils";

export type FrameMark = { box: Box; label: string; confidence?: number };

const pct = (n: number) => `${(n * 100).toFixed(3)}%`;

/** Box position as CSS percentages of the image. Exported for tests. */
export function boxStyle(box: Box) {
  return { left: pct(box.x), top: pct(box.y), width: pct(box.w), height: pct(box.h) };
}

/**
 * A stored snapshot with its marks drawn over it at percentage positions, so they
 * stay on their objects at every width. The `lens` mark (the answer) is a brass ring
 * drawn around the item by anime.js, shown complete under reduced motion.
 */
export function SnapshotFrame({
  src,
  alt,
  width,
  height,
  lens,
  marks = [],
  className,
  priority,
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
  lens?: FrameMark | null;
  marks?: FrameMark[];
  className?: string;
  priority?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  useAnime(
    root,
    ({ reduced }) => {
      if (!lens || reduced) return;
      const [ring] = createDrawable("[data-lens-ring]");
      animate(ring, { draw: ["0 0", "0 1"], duration: 900, ease: "inOutQuad" });
    },
    [src, lens?.box.x, lens?.box.y],
  );

  return (
    <div className={cn("relative w-full overflow-hidden bg-panel", className)} ref={root}>
      {/* eslint-disable-next-line @next/next/no-img-element -- signed URLs change per request */}
      <img
        alt={alt}
        className="block h-auto w-full"
        decoding="async"
        fetchPriority={priority ? "high" : "auto"}
        height={height}
        src={src}
        width={width}
      />
      {marks.map((mark, i) => (
        <div
          aria-label={mark.label}
          className="absolute border border-dashed border-ink-muted/70"
          key={`${mark.label}-${i}`}
          role="img"
          style={boxStyle(mark.box)}
        />
      ))}
      {lens && (
        <div aria-label={`${lens.label} marked`} className="absolute" role="img" style={boxStyle(lens.box)}>
          <svg
            aria-hidden
            className="absolute -inset-[14%] h-[128%] w-[128%] overflow-visible"
            preserveAspectRatio="none"
            viewBox="0 0 100 100"
          >
            <ellipse
              cx="50"
              cy="50"
              fill="none"
              rx="48"
              ry="48"
              stroke="var(--paper)"
              strokeWidth="7"
              vectorEffect="non-scaling-stroke"
            />
            <ellipse
              cx="50"
              cy="50"
              data-lens-ring
              fill="none"
              rx="48"
              ry="48"
              stroke="var(--brass)"
              strokeWidth="3.5"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </div>
      )}
    </div>
  );
}
