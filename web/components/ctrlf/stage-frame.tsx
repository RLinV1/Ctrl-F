"use client";

import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Steam, type SteamVent } from "./steam";

/*
 * The narrator's stage in a walnut and brass frame, matching the sidebar: the same walnut
 * ground and brass edge. A brass pipe runs along the top and down both sides (its centre
 * line sits on the frame's outer edge), with flanged joints, valve wheels and five vents.
 * While a question is worked on, the vents jet vapour into the screen until it is hidden;
 * when the answer arrives the vapour dissipates and reveals it (steam.tsx). The dialogue
 * box stays above the steam, so its words are always readable; the steam is decoration and
 * says nothing the dialogue does not.
 */

/** Pipe thickness in px. Straight runs, elbows and flanges are all sized from it. */
const T = 14;
const R = T * 1.5; // elbow centre-line radius

/** Brass tube shading across the pipe: dark rim, bright highlight, body, dark underside. */
const TUBE = "#6e4b15 0%, #e2bf74 28%, #c79a4a 42%, #a8772a 62%, #5a3f17 100%";

function Elbow({ corner }: { corner: "tl" | "tr" }) {
  // A quarter bend from the top run into a side run, drawn for the top-left corner and
  // mirrored for the top-right. The radial shading matches the straight runs' gradient.
  const size = R + T / 2;
  const id = `elbow-${corner}`;
  return (
    <svg
      aria-hidden
      className={cn("absolute", corner === "tr" && "-scale-x-100")}
      height={size}
      style={{ top: -T / 2, [corner === "tl" ? "left" : "right"]: -T / 2 } as CSSProperties}
      viewBox={`0 0 ${size} ${size}`}
      width={size}
    >
      <defs>
        <radialGradient cx={size} cy={size} gradientUnits="userSpaceOnUse" id={id} r={size}>
          <stop offset={(R - T / 2) / size} stopColor="#5a3f17" />
          <stop offset={(R - T / 2 + T * 0.38) / size} stopColor="#a8772a" />
          <stop offset={(R - T / 2 + T * 0.58) / size} stopColor="#c79a4a" />
          <stop offset={(R - T / 2 + T * 0.72) / size} stopColor="#e2bf74" />
          <stop offset={1} stopColor="#6e4b15" />
        </radialGradient>
      </defs>
      <path d={`M ${size} ${T / 2} A ${R} ${R} 0 0 0 ${T / 2} ${size}`} fill="none" stroke={`url(#${id})`} strokeWidth={T} />
    </svg>
  );
}

/** A collar where two lengths of pipe bolt together. `along` is a CSS position on the run. */
function Flange({ run, along }: { run: "top" | "left" | "right"; along: string }) {
  const horizontal = run === "top";
  const style: CSSProperties = horizontal
    ? { left: along, top: -T / 2 - 3, width: 8, height: T + 6, transform: "translateX(-50%)" }
    : { top: along, [run]: -T / 2 - 3, width: T + 6, height: 8, transform: "translateY(-50%)" };
  return (
    <span
      aria-hidden
      className="absolute border border-[#3b2716]/60"
      style={{ ...style, background: `linear-gradient(${horizontal ? "to bottom" : "to right"}, ${TUBE})` }}
    />
  );
}

/** A hand wheel on a side run: a brass rim with four spokes. */
function Valve({ side, along }: { side: "left" | "right"; along: string }) {
  return (
    <svg
      aria-hidden
      className="absolute"
      height={26}
      style={{ top: along, [side]: -13, transform: "translateY(-50%)" } as CSSProperties}
      viewBox="0 0 26 26"
      width={26}
    >
      <circle cx="13" cy="13" fill="none" r="10" stroke="#5a3f17" strokeWidth="4" />
      <circle cx="13" cy="13" fill="none" r="10" stroke="#c79a4a" strokeWidth="2" />
      <path d="M13 3v20M3 13h20" stroke="#a8772a" strokeWidth="2" />
      <circle cx="13" cy="13" fill="#e2bf74" r="3" stroke="#5a3f17" strokeWidth="1" />
    </svg>
  );
}

type VentAt = { run: "top"; along: string } | { run: "left" | "right"; along: string };

const VENTS: VentAt[] = [
  { run: "top", along: "22%" },
  { run: "top", along: "50%" },
  { run: "top", along: "78%" },
  { run: "left", along: "34%" },
  { run: "right", along: "34%" },
];

/** A short stub with a cap, standing off the pipe: the steam's way into the screen. */
function Vent({ at }: { at: VentAt }) {
  const horizontal = at.run === "top";
  // The vent stands up from the top run, or out sideways from a side run.
  const box: CSSProperties = horizontal
    ? { left: at.along, top: -T / 2 - 14, width: 10, height: 14, transform: "translateX(-50%)" }
    : { top: at.along, [at.run]: -T / 2 - 14, width: 14, height: 10, transform: "translateY(-50%)" };
  const capAt: CSSProperties = horizontal
    ? { left: -3, top: -2, width: 16, height: 5 }
    : { [at.run]: -2, top: -3, width: 5, height: 16 };
  return (
    <span aria-hidden className="absolute" style={box}>
      <span
        className="absolute inset-0"
        style={{ background: `linear-gradient(${horizontal ? "to right" : "to bottom"}, ${TUBE})` }}
      />
      <span className="absolute bg-[#5a3f17]" style={capAt} />
    </span>
  );
}

/** The vents as the steam sees them: a point on the screen's edge and the way it blows. */
const STEAM_VENTS: SteamVent[] = VENTS.map((at) => {
  const along = Number.parseFloat(at.along) / 100;
  if (at.run === "top") return { x: along, y: 0, angle: Math.PI / 2 };
  return at.run === "left" ? { x: 0, y: along, angle: 0 } : { x: 1, y: along, angle: Math.PI };
});

export function StageFrame({
  steaming,
  clearSteam = false,
  children,
}: {
  steaming: boolean;
  /** The full camera photo is up: clear any steam left over at once, so none sits over it. */
  clearSteam?: boolean;
  children: ReactNode;
}) {
  const end = R; // where an elbow hands over to a straight run
  return (
    // Room above and beside the frame for the pipe and its vents.
    <div className="relative px-4 pt-7 sm:px-6 sm:pt-7" data-steaming={steaming || undefined} data-testid="stage-frame">
      <div className="relative">
        {/* The frame: walnut with the sidebar's brass edge, a brass rule round the stage, rivets in the corners. */}
        <div className="relative border-2 border-sidebar-border bg-walnut p-2 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.35)] sm:p-5">
          {(["top-1 left-1", "top-1 right-1", "bottom-1 left-1", "bottom-1 right-1"] as const).map((at) => (
            <span
              aria-hidden
              className={cn("absolute size-1.5 rounded-full bg-[#c79a4a] shadow-[0_0_0_1px_#3b2716]", at)}
              key={at}
            />
          ))}
          <div className="relative ring-2 ring-[#8a6326]">
            {children}
            <Steam clear={clearSteam} on={steaming} vents={STEAM_VENTS} />
          </div>
        </div>

        {/* The pipe: a top run between two elbows, then a side run down each edge to a cap. */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <span
            className="absolute"
            style={{ left: end, right: end, top: -T / 2, height: T, background: `linear-gradient(to bottom, ${TUBE})` }}
          />
          {(["left", "right"] as const).map((side) => (
            <span
              className="absolute"
              key={side}
              style={{ [side]: -T / 2, top: end, height: "62%", width: T, background: `linear-gradient(to ${side === "left" ? "right" : "left"}, ${TUBE})` }}
            />
          ))}
          {(["left", "right"] as const).map((side) => (
            // The cap that closes each side run.
            <span
              className="absolute bg-[#5a3f17]"
              key={`cap-${side}`}
              style={{ [side]: -T / 2 - 2, top: `calc(${end}px + 62%)`, width: T + 4, height: 6 }}
            />
          ))}
          <Elbow corner="tl" />
          <Elbow corner="tr" />
          <Flange along={`${end}px`} run="top" />
          <Flange along={`calc(100% - ${end}px)`} run="top" />
          <Flange along="36%" run="top" />
          <Flange along="64%" run="top" />
          <Flange along={`${end}px`} run="left" />
          <Flange along={`${end}px`} run="right" />
          <Valve along="55%" side="left" />
          <Valve along="55%" side="right" />
          {VENTS.map((at) => (
            <Vent at={at} key={`${at.run}-${at.along}`} />
          ))}
        </div>
      </div>
    </div>
  );
}
