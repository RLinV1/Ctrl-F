"use client";

import { stagger, waapi } from "animejs";
import { useEffect, useRef } from "react";
import { prefersReducedMotion } from "@/lib/motion/use-anime";
import { cn } from "@/lib/utils";
import { gearPath } from "./gear";

/** Brass, dark brass, copper and iron, repeating along the row. */
const COLOURS = ["var(--brass)", "var(--brass-ink)", "var(--copper)", "var(--ink)"];
const COGS = 7;

/**
 * The working state: a row of cogs that hop, turn into place and swell in a wave
 * (anime.js on the Web Animations API). Shown only while a question is being worked
 * on; under reduced motion the cogs stand still.
 */
export function CogTrain({ className, label = "Working on it" }: { className?: string; label?: string }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const cogs = root.current?.querySelectorAll<SVGSVGElement>("[data-cog]");
    if (!cogs?.length || prefersReducedMotion()) return;
    const animation = waapi.animate(cogs, {
      y: { to: [0, -30, 0], ease: "out(4)", duration: 1000 },
      rotate: { from: -180, to: 0, ease: "out(3)" },
      scale: { to: [0.65, 1, 0.65], ease: "inOut(3)" },
      duration: 500,
      delay: stagger(75),
      loop: true,
    });
    return () => {
      animation.revert();
    };
  }, []);

  return (
    <div aria-label={label} className={cn("flex h-14 items-end gap-1.5 pt-8", className)} ref={root} role="img">
      {Array.from({ length: COGS }, (_, i) => (
        <svg aria-hidden className="size-6 shrink-0" data-cog key={i} viewBox="-20 -20 40 40">
          <path d={gearPath(18, 4.5)} fill={COLOURS[i % COLOURS.length]} />
          <circle fill="var(--panel)" r="6" />
        </svg>
      ))}
    </div>
  );
}
