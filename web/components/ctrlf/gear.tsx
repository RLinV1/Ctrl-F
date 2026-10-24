"use client";

import { animate } from "animejs";
import { useRef } from "react";
import { useAnime } from "@/lib/motion/use-anime";
import { cn } from "@/lib/utils";

const TEETH = 10;

function gearPath(r: number, depth: number) {
  const points: string[] = [];
  for (let i = 0; i < TEETH * 2; i++) {
    const a0 = (i / (TEETH * 2)) * Math.PI * 2;
    const a1 = ((i + 1) / (TEETH * 2)) * Math.PI * 2;
    const rr = i % 2 === 0 ? r : r - depth;
    points.push(`${(Math.cos(a0) * rr).toFixed(2)},${(Math.sin(a0) * rr).toFixed(2)}`);
    points.push(`${(Math.cos(a1) * rr).toFixed(2)},${(Math.sin(a1) * rr).toFixed(2)}`);
  }
  return `M${points.join("L")}Z`;
}

/** The progress state: a brass gear that turns only while `turning`, still under reduced motion. */
export function Gear({ turning, className }: { turning: boolean; className?: string }) {
  const root = useRef<SVGSVGElement>(null);
  useAnime(
    root,
    ({ reduced }) => {
      if (!turning || reduced) return;
      animate("[data-gear]", { rotate: 360, duration: 2400, ease: "linear", loop: true });
    },
    [turning],
  );
  return (
    <svg aria-hidden className={cn("size-8 text-brass", className)} ref={root} viewBox="-20 -20 40 40">
      <g data-gear>
        <path d={gearPath(18, 4)} fill="currentColor" />
        <circle fill="var(--sheet)" r="6" />
      </g>
    </svg>
  );
}
