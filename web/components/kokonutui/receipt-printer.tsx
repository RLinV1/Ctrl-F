"use client";

/**
 * @author: @dorianbaffier
 * @description: Receipt Printer
 * @version: 1.0.0
 * @date: 2026-10-14
 * @license: MIT
 * @website: https://kokonutui.com
 * @github: https://github.com/kokonut-labs/kokonutui
 */

import {
  type PointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";

// Where the paper comes out, from the top of the card.
const SLOT_Y = 64;
// The printer feeds a line at a time, with a short stop between lines.
const LINE = 15;
const FEED_RATE = 34;
const LINE_PAUSE = 0.055;
const LINE_JITTER = 0.05;
// Simulation, in px and seconds, on a fixed step.
const STEP = 1 / 120;
const GRAVITY = 2600;
const DAMPING = 0.996;
// While hanging from the slot, a pull stretches only this far, with
// growing resistance, and tears past this much drag.
const MAX_PULL = 18;
const TEAR_DRAG = 72;
// A sharp downward yank tears it too, in px per second.
const TEAR_SPEED = 900;
// A tilted sheet glides sideways as it falls.
const GLIDE = 0.35;
const REST_EPSILON = 0.02;

type Phase = "idle"|"printing"|"hanging"|"held"|"falling";

/** One printed line on the slip. */
export interface SlipLine {
  text: string;
  /** Set in the slip's larger weight, for the outcome. */
  strong?: boolean;
  /** Printed in the muted ink, for labels and the stamp. */
  quiet?: boolean;
}

export interface ReceiptPrinterProps {
  /** Ctrl-F: name on the printer housing and the slip's heading. */
  heading?: string;
  /** Time or reference printed under the heading. */
  stamp?: string;
  lines?: SlipLine[];
  /** Accessible name for the slip. */
  label?: string;
  /** Ctrl-F: when there is nothing to print, show this note and no print button. */
  emptyNote?: string;
  /** Print as soon as the printer scrolls into view. */
  autoPrint?: boolean;
  onPrint?: () => void;
  onTear?: () => void;
  className?: string;
}

const DEFAULT_LINES: SlipLine[] = [{ text: "Ask a question to print an answer.", quiet: true }];

function damp(distance: number, max: number) {
  return max * (1 - Math.exp(-distance / max));
}

function haptic(ms = 8) {
  if (typeof navigator !== "undefined"&&"vibrate" in navigator) {
    navigator.vibrate(ms);
  }
}

/** Local point p on a sheet turned by `angle`, relative to its corner. */
function turn(px: number, py: number, angle: number) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [px * cos - py * sin, px * sin + py * cos];
}

/** Ctrl-F: a telegram slip in place of the shop receipt. */
function Receipt({ heading, stamp, lines }: { heading: string; stamp: string; lines: SlipLine[] }) {
  return (
    <div className="px-5 pt-6 pb-8 text-[13px] text-ink leading-[18px]">
      <p className="text-center font-semibold text-[13px]">{heading}</p>
      <p className="figures text-center text-ink-muted">{stamp}</p>
      <p aria-hidden="true" className="my-[7px] overflow-hidden whitespace-nowrap text-center text-ink-muted">
        {"- ".repeat(13)}
      </p>
      {lines.map((line, i) => (
        <p
          className={cn(
            "mt-1 first:mt-0",
            line.strong && "font-semibold text-[15px] leading-5",
            line.quiet && "text-ink-muted",
          )}
          // biome-ignore lint/suspicious/noArrayIndexKey: lines of one slip, never reordered
          key={i}
        >
          {line.text}
        </p>
      ))}
      <p aria-hidden="true" className="my-[7px] overflow-hidden whitespace-nowrap text-center text-ink-muted">
        {"- ".repeat(13)}
      </p>
      <p className="text-center text-ink-muted">Stop.</p>
    </div>
  );
}

// Serrated edges: the bottom was torn off the last receipt, and the top
// gets the same edge once this one is torn.
const TOOTH = 8;
const edge = (side: "top"|"bottom") =>
  `conic-gradient(from ${side === "bottom"?"-45deg at 50% 100%":"135deg at 50% 0"}, #0000, #000 1deg 89deg, #0000 90deg) 50% ${side === "bottom"?"100%":"0"} / ${TOOTH}px ${TOOTH / 2}px repeat-x`; // taste-skill-ignore: a mask or hard-stop pattern, not a colour gradient
const FILL = `linear-gradient(#000 0 0) 0 ${TOOTH / 2}px / 100% calc(100% - ${TOOTH}px) no-repeat`; // taste-skill-ignore: a mask or hard-stop pattern, not a colour gradient
const MASK_RESTING = `${edge("bottom")}, linear-gradient(#000 0 0) 0 0 / 100% calc(100% - ${TOOTH / 2}px) no-repeat`; // taste-skill-ignore: a mask or hard-stop pattern, not a colour gradient
const MASK_TORN = `${edge("top")}, ${edge("bottom")}, ${FILL}`;

export default function ReceiptPrinter({
  heading = "Ctrl-F telegram",
  stamp = "",
  lines = DEFAULT_LINES,
  label = "Answer slip",
  emptyNote,
  autoPrint = true,
  onPrint,
  onTear,
  className,
}: ReceiptPrinterProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [torn, setTorn] = useState(false);

  const cardRef = useRef<HTMLDivElement>(null);
  const paperRef = useRef<HTMLDivElement>(null);
  const printerRef = useRef<HTMLDivElement>(null);
  const printButtonRef = useRef<HTMLButtonElement>(null);
  const tearButtonRef = useRef<HTMLButtonElement>(null);
  // Set when a keyboard press started the print or the tear, whose button
  // then goes away: focus follows to the next control instead of the body.
  const keyboardFocus = useRef(false);

  const sim = useRef({
    phase: "idle" as Phase,
    width: 0,
    height: 0,
    slotX: 0,
    // Centre of mass, now and one step ago (Verlet), and the sheet's angle.
    cx: 0,
    cy: 0,
    pcx: 0,
    pcy: 0,
    angle: 0,
    spin: 0,
    // The hinge: a world point the sheet hangs from, and where on the
    // sheet it is.
    hx: 0,
    hy: 0,
    hingeX: 0,
    hingeY: 0,
    // Printing: how much paper is still inside the printer.
    hidden: 0,
    feedTarget: 0,
    pause: 0,
    // Dragging.
    pointerId: -1,
    grabX: 0,
    grabY: 0,
    startX: 0,
    startY: 0,
    samples: [] as { t: number; x: number; y: number }[],
    raf: 0,
    last: 0,
    carry: 0,
    // Motion in the last fixed step. Kept across frames: on a display
    // faster than the step rate some frames run no step at all.
    busy: 0,
    visible: false,
    reduceMotion: false,
  });

  const callbacks = useRef({ onPrint, onTear });
  callbacks.current = { onPrint, onTear };

  const setPhaseBoth = useCallback((next: Phase) => {
    sim.current.phase = next;
    // A new phase is in motion until its first step says otherwise.
    sim.current.busy = 1;
    setPhase(next);
  }, []);

  const draw = useCallback(() => {
    const s = sim.current;
    const paper = paperRef.current;
    if (!paper) {
      return;
    }
    // Place the sheet so its centre of mass lands on (cx, cy), turned by
    // `angle` around its top-left corner.
    const [ox, oy] = turn(s.width / 2, s.height / 2, s.angle);
    const left = s.slotX - s.width / 2;
    const tx = s.cx - ox - left;
    const ty = s.cy - oy - SLOT_Y;
    paper.style.transform = `translate3d(${tx.toFixed(2)}px,${ty.toFixed(2)}px,0) rotate(${s.angle.toFixed(4)}rad)`;
  }, []);

  // The centre of mass for a sheet hanging from the hinge at `angle`.
  const hangAt = useCallback((angle: number) => {
    const s = sim.current;
    const [dx, dy] = turn(
      s.width / 2 - s.hingeX,
      s.height / 2 - s.hingeY,
      angle
    );
    return [s.hx + dx, s.hy + dy];
  }, []);

  const placeAtSlot = useCallback(
    (pull: number) => {
      const s = sim.current;
      s.hingeX = s.width / 2;
      s.hingeY = 0;
      s.hx = s.slotX;
      s.hy = SLOT_Y + pull;
      const [cx, cy] = hangAt(0);
      s.cx = cx;
      s.cy = cy;
      s.pcx = cx;
      s.pcy = cy;
      s.angle = 0;
    },
    [hangAt]
  );

  // A thermal printer moves in short bursts: feed a line, stop, feed.
  const stepPrinting = useCallback(
    (dt: number) => {
      const s = sim.current;
      if (s.pause > 0) {
        s.pause -= dt;
      } else if (s.feedTarget > 0) {
        s.feedTarget = Math.max(0, s.feedTarget - LINE);
        s.pause = LINE_PAUSE + Math.random() * LINE_JITTER;
      }
      s.hidden += (s.feedTarget - s.hidden) * Math.min(1, FEED_RATE * dt);
      if (Math.abs(s.hidden - s.feedTarget) < 0.05) {
        s.hidden = s.feedTarget;
      }
      placeAtSlot(-s.hidden);
      const printer = printerRef.current;
      if (printer) {
        // The housing buzzes while the motor runs.
        const buzz = s.pause > 0 ? 0 : Math.sin(performance.now() / 9) * 0.4;
        printer.style.transform = `translate3d(${buzz.toFixed(2)}px,0,0)`;
      }
      if (s.hidden === 0 && s.feedTarget === 0) {
        if (printer) {
          printer.style.transform = "";
        }
        setPhaseBoth("hanging");
        return 0;
      }
      return 1;
    },
    [placeAtSlot, setPhaseBoth]
  );

  // Hanging from a hinge: the centre of mass swings on a fixed-length
  // rod, and the sheet turns with it.
  const stepPendulum = useCallback(() => {
    const s = sim.current;
    const vx = (s.cx - s.pcx) * DAMPING;
    const vy = (s.cy - s.pcy) * DAMPING;
    s.pcx = s.cx;
    s.pcy = s.cy;
    s.cx += vx;
    s.cy += vy + GRAVITY * STEP * STEP;
    const rod = Math.hypot(s.width / 2 - s.hingeX, s.height / 2 - s.hingeY);
    const dx = s.cx - s.hx;
    const dy = s.cy - s.hy;
    const dist = Math.hypot(dx, dy) || 1;
    s.cx = s.hx + (dx / dist) * rod;
    s.cy = s.hy + (dy / dist) * rod;
    const rest = Math.atan2(s.height / 2 - s.hingeY, s.width / 2 - s.hingeX);
    s.angle = Math.atan2(s.cy - s.hy, s.cx - s.hx) - rest;
    return Math.abs(vx) + Math.abs(vy);
  }, []);

  // Free fall: gravity, a little air, and a tilted sheet drifts sideways.
  const stepFalling = useCallback(() => {
    const s = sim.current;
    let vx = (s.cx - s.pcx) * DAMPING;
    const vy = (s.cy - s.pcy) * DAMPING;
    vx += Math.sin(s.angle) * Math.max(vy, 0) * GLIDE * STEP * 10;
    s.pcx = s.cx;
    s.pcy = s.cy;
    s.cx += vx;
    s.cy += vy + GRAVITY * STEP * STEP;
    s.angle += s.spin * STEP;
    s.spin *= 0.995;
    // Off the bottom of the card: done.
    const card = cardRef.current;
    const floor =
      (card?.clientHeight ?? 400) + Math.hypot(s.width, s.height) / 2;
    return s.cy > floor ? 0 : 1;
  }, []);

  const stepPhysics = useCallback(
    (elapsed: number) => {
      const s = sim.current;
      s.carry += elapsed;
      while (s.carry >= STEP) {
        s.carry -= STEP;
        if (s.phase === "falling") {
          s.busy = stepFalling();
        } else if (s.phase === "hanging"|| s.phase ==="held") {
          s.busy = stepPendulum();
        }
      }
      return s.busy;
    },
    [stepFalling, stepPendulum]
  );

  const finishFall = useCallback(() => {
    setPhaseBoth("idle");
  }, [setPhaseBoth]);

  const tick = useCallback(
    (now: number) => {
      const s = sim.current;
      s.raf = 0;
      const elapsed = s.last ? Math.min((now - s.last) / 1000, 0.05) : STEP;
      s.last = now;
      const busy =
        s.phase === "printing" ? stepPrinting(elapsed) : stepPhysics(elapsed);
      draw();
      if (s.phase === "falling" && busy === 0) {
        finishFall();
        s.last = 0;
        return;
      }
      const keepGoing =
        s.phase === "printing" ||
        s.phase === "falling" ||
        s.pointerId >= 0 ||
        busy > REST_EPSILON;
      if (keepGoing && s.visible) {
        s.raf = requestAnimationFrame(tick);
      } else {
        s.last = 0;
      }
    },
    [draw, finishFall, stepPhysics, stepPrinting]
  );

  const wake = useCallback(() => {
    const s = sim.current;
    if (!s.raf && s.visible) {
      s.raf = requestAnimationFrame(tick);
    }
  }, [tick]);

  const measure = useCallback(() => {
    const s = sim.current;
    const card = cardRef.current;
    const paper = paperRef.current;
    if (!(card && paper)) {
      return;
    }
    s.width = paper.offsetWidth;
    s.height = paper.offsetHeight;
    s.slotX = card.clientWidth / 2;
  }, []);

  const print = useCallback(() => {
    const s = sim.current;
    measure();
    setTorn(false);
    callbacks.current.onPrint?.();
    if (s.reduceMotion) {
      placeAtSlot(0);
      draw();
      setPhaseBoth("hanging");
      return;
    }
    s.hidden = s.height;
    s.feedTarget = s.height;
    s.pause = 0.25;
    placeAtSlot(-s.hidden);
    draw();
    setPhaseBoth("printing");
    wake();
  }, [draw, measure, placeAtSlot, setPhaseBoth, wake]);

  const tear = useCallback(
    (held: boolean) => {
      const s = sim.current;
      setTorn(true);
      haptic(14);
      callbacks.current.onTear?.();
      const printer = printerRef.current;
      printer?.animate(
        [
          { transform: "translate3d(0,1.5px,0)" },
          { transform: "translate3d(0,0,0)" },
        ],
        { duration: 220, easing: "cubic-bezier(0.23, 1, 0.32, 1)" }
      );
      if (s.reduceMotion) {
        setPhaseBoth("idle");
        return;
      }
      setPhaseBoth(held ? "held":"falling");
      wake();
    },
    [setPhaseBoth, wake]
  );

  // Print once it scrolls into view; pause the loop when it's offscreen.
  useEffect(() => {
    const s = sim.current;
    const card = cardRef.current;
    if (!card) {
      return;
    }
    s.reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    measure();
    placeAtSlot(-s.height);
    draw();
    let printed = false;
    let onScreen = false;
    const update = () => {
      s.visible = onScreen && !document.hidden;
      if (!s.visible) {
        cancelAnimationFrame(s.raf);
        s.raf = 0;
        s.last = 0;
        return;
      }
      if (autoPrint && !printed) {
        printed = true;
        print();
      }
      wake();
    };
    const intersection = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry.isIntersecting;
        update();
      },
      { threshold: 0.4 }
    );
    intersection.observe(card);
    document.addEventListener("visibilitychange", update);
    return () => {
      intersection.disconnect();
      document.removeEventListener("visibilitychange", update);
      cancelAnimationFrame(s.raf);
      s.raf = 0;
    };
  }, [autoPrint, draw, measure, placeAtSlot, print, wake]);

  const localPoint = (event: PointerEvent) => {
    const rect = cardRef.current?.getBoundingClientRect();
    return rect
      ? { x: event.clientX - rect.left, y: event.clientY - rect.top }
      : { x: 0, y: 0 };
  };

  // A world point to where it sits on the sheet.
  const toSheet = (x: number, y: number) => {
    const s = sim.current;
    const [ox, oy] = turn(s.width / 2, s.height / 2, s.angle);
    const cornerX = s.cx - ox;
    const cornerY = s.cy - oy;
    return turn(x - cornerX, y - cornerY, -s.angle);
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const s = sim.current;
    if (
      s.phase !== "hanging" ||
      (event.pointerType === "mouse" && event.button !== 0)
    ) {
      return;
    }
    const { x, y } = localPoint(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    s.pointerId = event.pointerId;
    s.startX = x;
    s.startY = y;
    const [gx, gy] = toSheet(x, y);
    s.grabX = gx;
    s.grabY = gy;
    s.samples = [{ t: event.timeStamp, x, y }];
    wake();
  };

  // Still attached: the sheet turns about the slot so the grabbed point
  // follows the hand sideways, and stretches a little downward.
  const dragAttached = (x: number, y: number) => {
    const s = sim.current;
    const pull = damp(Math.max(0, y - s.startY), MAX_PULL);
    s.hingeX = s.width / 2;
    s.hingeY = 0;
    s.hx = s.slotX;
    s.hy = SLOT_Y + pull;
    const reach = Math.max(s.grabY, 24);
    const angle = -Math.atan2(x - s.slotX - (s.grabX - s.width / 2), reach);
    const [cx, cy] = hangAt(angle * 0.7);
    s.pcx = s.cx;
    s.pcy = s.cy;
    s.cx = cx;
    s.cy = cy;
    s.angle = angle * 0.7;
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const s = sim.current;
    if (s.pointerId !== event.pointerId) {
      return;
    }
    const { x, y } = localPoint(event);
    s.samples.push({ t: event.timeStamp, x, y });
    if (s.samples.length > 5) {
      s.samples.shift();
    }
    if (s.phase === "hanging") {
      if (y - s.startY > TEAR_DRAG) {
        // It rips at the slot and stays in the hand, swinging from where
        // it was grabbed.
        s.hingeX = s.grabX;
        s.hingeY = s.grabY;
        s.hx = x;
        s.hy = y;
        tear(true);
      } else {
        dragAttached(x, y);
      }
    } else if (s.phase === "held") {
      s.hx = x;
      s.hy = y;
    }
    wake();
  };

  const releaseVelocity = () => {
    const s = sim.current;
    const first = s.samples[0];
    const last = s.samples.at(-1) ?? first;
    const dt = Math.max((last.t - first.t) / 1000, 0.016);
    return { vx: (last.x - first.x) / dt, vy: (last.y - first.y) / dt };
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const s = sim.current;
    if (s.pointerId !== event.pointerId) {
      return;
    }
    s.pointerId = -1;
    const { vx, vy } = releaseVelocity();
    if (s.phase === "held") {
      // Thrown: keep the hand's speed, and spin from the swing.
      const prevAngle = s.angle;
      stepPendulum();
      s.spin = (s.angle - prevAngle) / STEP + vx * 0.002;
      s.pcx = s.cx - vx * STEP * 0.6;
      s.pcy = s.cy - vy * STEP * 0.6;
      setPhaseBoth("falling");
    } else if (s.phase === "hanging" && vy > TEAR_SPEED) {
      // A sharp yank tears it straight off.
      s.pcx = s.cx - vx * STEP * 0.5;
      s.pcy = s.cy - vy * STEP * 0.5;
      s.spin = vx * 0.004;
      tear(false);
    } else if (s.phase === "hanging") {
      // Let go: it springs back up to the slot and the swing plays out.
      s.hy = SLOT_Y;
      s.pcx = s.cx;
      s.pcy = s.cy;
    }
    wake();
  };

  // Keyboard users land on the next control once the button they pressed
  // has gone: the tear button after printing, Print again after the fall.
  useEffect(() => {
    if (!keyboardFocus.current) {
      return;
    }
    if (phase === "hanging") {
      tearButtonRef.current?.focus({ preventScroll: true });
    } else if (phase === "idle") {
      keyboardFocus.current = false;
      printButtonRef.current?.focus({ preventScroll: true });
    }
  }, [phase]);

  const handleTearKey = () => {
    const s = sim.current;
    if (s.phase === "hanging") {
      keyboardFocus.current = true;
      s.spin = 1.2;
      s.pcy = s.cy - 3;
      tear(false);
    }
  };

  const busy = phase === "printing";
  let status = "Ready";
  if (busy) {
    status = "Printing…";
  } else if (phase === "hanging") {
    status = "Pull down to tear";
  }

  return (
    <div
      className={cn(
        "relative h-[30rem] w-72 select-none overflow-hidden border border-rule bg-panel text-ink",
        className
      )}
      ref={cardRef}
    >
      {/* The sheet, clipped at the slot until it's torn free. */}
      <div
        className={cn(
          "absolute inset-x-0 bottom-0",
          torn ? "overflow-visible":"overflow-hidden"
        )}
        style={{ top: SLOT_Y }}
      >
        <div
          aria-label={label}
          className={cn(
            "absolute top-0 w-56 bg-card-row",
            phase === "hanging"&&"cursor-grab active:cursor-grabbing",
            phase === "held"&&"cursor-grabbing",
            phase === "idle"&& torn &&"invisible"
          )}
          onLostPointerCapture={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          ref={paperRef}
          role="document"
          style={{
            left: "50%",
            marginLeft: "-7rem",
            transformOrigin: "0 0",
            // Inside the printer until the first frame places it, so the
            // server render does not flash a full receipt.
            transform: "translate3d(0,-100%,0)",
            mask: torn ? MASK_TORN : MASK_RESTING,
            WebkitMask: torn ? MASK_TORN : MASK_RESTING,
            touchAction: "none",
          }}
        >
          {/* Perforation along the slot, where the sheet tears off. */}
          {!torn && (
            <span
              aria-hidden="true"
              className="absolute inset-x-1 top-1 border-rule border-t-2 border-dotted"
            />
          )}
          <Receipt heading={heading} lines={lines} stamp={stamp} />
        </div>
      </div>

      {/* The printer housing, in front of the paper's top edge. */}
      <div
        className="absolute inset-x-0 top-0 h-16 border-rule border-b bg-sheet"
        ref={printerRef}
      >
        <div className="flex items-center justify-between px-5 pt-4 text-xs">
          <span className="font-medium">{heading}</span>
          <span aria-live="polite" className="text-ink-muted ">
            {status}
          </span>
        </div>
        <div className="absolute inset-x-8 bottom-2 h-1 bg-ink" />
      </div>

      {phase === "hanging" && (
        <button
          className="sr-only focus:not-sr-only focus:absolute focus:right-4 focus:bottom-4 focus:bg-ink focus:px-3 focus:py-1.5 focus:text-paper focus:text-xs "
          onClick={handleTearKey}
          ref={tearButtonRef}
          type="button"
        >
          Tear off slip
        </button>
      )}

      {emptyNote && (
        <p className="absolute inset-x-0 top-1/2 -translate-y-1/2 px-6 text-center text-ink-muted text-sm">{emptyNote}</p>
      )}
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 flex justify-center p-5 transition-opacity duration-200 ease-out",
          phase === "idle" ? "opacity-100" : "pointer-events-none opacity-0",
          // Last, so it wins over `flex` when the classes are merged.
          emptyNote && "hidden"
        )}
      >
        <button
          className="bg-ink px-4 py-2 font-medium text-paper text-sm outline-none transition-colors duration-150 ease-out hover:bg-ink-muted focus-visible:ring-2 focus-visible:ring-ink-muted focus-visible:ring-offset-2 "
          disabled={phase !== "idle"}
          onClick={(event) => {
            // detail is 0 for a click from Enter or Space.
            keyboardFocus.current = event.detail === 0;
            print();
          }}
          ref={printButtonRef}
          tabIndex={phase === "idle" ? 0 : -1}
          type="button"
        >
          {torn ? "Print it again":"Print answer"}
        </button>
      </div>
    </div>
  );
}
