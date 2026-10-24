"use client";

/**
 * @author: @kokonutui
 * @description: Contact Sheet
 * @version: 1.0.0
 * @license: MIT
 * @website: https://kokonutui.com
 * @github: https://github.com/kokonut-labs/kokonutui
 *
 * Ctrl-F adaptation: frames are an item's sightings on film strips. The china-marker
 * pick/strike marks are replaced by the item's box, the frame edge carries the time
 * and place instead of frame numbers, and choosing a frame shows it large. The loupe
 * stays: hover a frame to look at the item up close. Frames keep the camera's 16:9.
 */

import { ZoomIn } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type CSSProperties, type PointerEvent, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** How much the loupe magnifies, and its size in px. */
const ZOOM = 3;
const LOUPE = 136;

export interface ContactFrame {
  id: string;
  src: string;
  alt: string;
  /** The item's box in the frame, as fractions of the image. */
  box: { x: number; y: number; w: number; h: number };
  /** Printed on the film edge under the frame. */
  edge: string;
}

export interface ContactSheetProps {
  frames: ContactFrame[];
  /** Frames per strip on wider screens; phones show two. */
  perStrip?: number;
  selectedId?: string;
  onSelect?: (frame: ContactFrame) => void;
  className?: string;
}

const pct = (n: number) => `${(n * 100).toFixed(3)}%`;

const frameStyle = (frame: ContactFrame): CSSProperties => ({
  backgroundImage: `url("${frame.src}")`,
  backgroundSize: "100% 100%",
});

interface Lens {
  frame: ContactFrame;
  /** Loupe center, in the sheet's px. */
  left: number;
  top: number;
  size: string;
  position: string;
}

function Frame({
  frame,
  selected,
  loupe,
  onSelect,
  onLens,
  onLeave,
}: {
  frame: ContactFrame;
  selected: boolean;
  loupe: boolean;
  onSelect: (frame: ContactFrame) => void;
  onLens: (event: PointerEvent<HTMLButtonElement>, frame: ContactFrame) => void;
  onLeave: () => void;
}) {
  return (
    <div className="relative">
      <button
        aria-label={`${frame.alt}, ${frame.edge}`}
        aria-pressed={selected}
        className={cn(
          "relative block aspect-video w-full overflow-hidden bg-ink outline-none focus-visible:ring-2 focus-visible:ring-brass focus-visible:ring-offset-2 focus-visible:ring-offset-ink",
          loupe && "cursor-none",
          selected && "ring-2 ring-brass",
        )}
        data-frame={frame.id}
        onClick={() => {
          onLeave();
          onSelect(frame);
        }}
        onPointerLeave={onLeave}
        onPointerMove={(event) => onLens(event, frame)}
        type="button"
      >
        <span className="absolute inset-0 bg-no-repeat" style={frameStyle(frame)} />
        <span
          aria-hidden="true"
          className="absolute border-2 border-brass"
          style={{ left: pct(frame.box.x), top: pct(frame.box.y), width: pct(frame.box.w), height: pct(frame.box.h) }}
        />
      </button>
    </div>
  );
}

/** A row of sprocket holes along the film edge. */
function Sprockets() {
  return (
    <div
      aria-hidden="true"
      className="mx-1 h-[5px]"
      style={{ backgroundImage: "repeating-linear-gradient(to right, var(--paper) 0 7px, transparent 7px 14px)" }} // taste-skill-ignore: a mask or hard-stop pattern, not a colour gradient
    />
  );
}

export default function ContactSheet({ frames, perStrip = 3, selectedId, onSelect, className }: ContactSheetProps) {
  const [lens, setLens] = useState<Lens | null>(null);
  const [loupe, setLoupe] = useState(true);
  const sheetRef = useRef<HTMLDivElement>(null);
  const reduceMotion = Boolean(useReducedMotion());

  const strips: ContactFrame[][] = [];
  for (let i = 0; i < frames.length; i += perStrip) strips.push(frames.slice(i, i + perStrip));

  const onLens = (event: PointerEvent<HTMLButtonElement>, frame: ContactFrame) => {
    const sheet = sheetRef.current?.getBoundingClientRect();
    if (!(loupe && sheet) || event.pointerType !== "mouse") {
      setLens(null);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    setLens({
      frame,
      left: event.clientX - sheet.left,
      top: event.clientY - sheet.top,
      size: `${rect.width * ZOOM}px ${rect.height * ZOOM}px`,
      position: `${LOUPE / 2 - px * ZOOM}px ${LOUPE / 2 - py * ZOOM}px`,
    });
  };

  return (
    <div className={cn("relative w-full", className)} ref={sheetRef}>
      <div className="flex items-center justify-end">
        <button
          aria-pressed={loupe}
          className={cn(
            "flex h-8 shrink-0 items-center gap-1.5 px-3 text-sm outline-none transition-colors duration-150",
            loupe ? "bg-ink text-paper" : "bg-panel text-ink hover:bg-rule",
          )}
          onClick={() => setLoupe((on) => !on)}
          type="button"
        >
          <ZoomIn aria-hidden className="size-3.5" />
          Loupe
        </button>
      </div>

      <div className="mt-3 space-y-3">
        {strips.map((strip) => (
          <div className="bg-ink py-1" key={strip[0].id}>
            <Sprockets />
            <div
              className="mt-1 grid grid-cols-2 gap-1 px-1 sm:[grid-template-columns:repeat(var(--per),minmax(0,1fr))]"
              style={{ "--per": perStrip } as CSSProperties}
            >
              {strip.map((frame) => (
                <div key={frame.id}>
                  <Frame
                    frame={frame}
                    loupe={loupe}
                    onLeave={() => setLens(null)}
                    onLens={onLens}
                    onSelect={(f) => onSelect?.(f)}
                    selected={frame.id === selectedId}
                  />
                  <p className="figures mt-1 truncate px-0.5 text-[13px] text-paper/85 leading-5">{frame.edge}</p>
                </div>
              ))}
            </div>
            <Sprockets />
          </div>
        ))}
      </div>

      <AnimatePresence>
        {lens && (
          <motion.div
            animate={{ opacity: 1 }}
            aria-hidden="true"
            className="pointer-events-none absolute z-20 rounded-full bg-ink bg-no-repeat outline-4 outline-brass"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            style={{
              width: LOUPE,
              height: LOUPE,
              left: lens.left - LOUPE / 2,
              top: lens.top - LOUPE / 2,
              backgroundImage: `url("${lens.frame.src}")`,
              backgroundSize: lens.size,
              backgroundPosition: lens.position,
            }}
            transition={{ duration: reduceMotion ? 0 : 0.12 }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
