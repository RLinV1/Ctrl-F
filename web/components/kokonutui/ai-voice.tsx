"use client";

/**
 * @author: @kokonutui
 * @description: AI Voice
 * @version: 2.1.0
 * @license: MIT
 * @website: https://kokonutui.com
 * @github: https://github.com/kokonut-labs/kokonutui
 *
 * Ctrl-F adaptation: hold-to-talk. Press and hold the button (pointer, or Space
 * while it has focus) to record; releasing sends. There is no review, playback or
 * discard step, and no demo loop. The scrolling waveform and the ring that swells
 * with the voice are kept and follow the real microphone level passed in `level`.
 */

import { Mic } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { type KeyboardEvent, type PointerEvent, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const BAR_COUNT = 48;
// One extra bar waits off the right edge, so the row can slide a full bar
// before the samples shift and nothing pops in.
const BAR_IDS = Array.from({ length: BAR_COUNT + 1 }, (_, i) => `bar-${i}`);
const BAR_PITCH = 5; // bar width + gap, px
const SAMPLE_MS = 70;
const REST_LEVEL = 0.12;
// Shape shown under reduced motion: still bars, no scrolling.
const STILL_LEVELS = BAR_IDS.map((_, i) => 0.25 + 0.5 * Math.abs(Math.sin(i * 0.55) * Math.cos(i * 0.21)));
const EDGE_MASK = "linear-gradient(to right, transparent, black 18%, black 92%, transparent)"; // taste-skill-ignore: a mask or hard-stop pattern, not a colour gradient

const formatTime = (seconds: number) => {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)
    .toString()
    .padStart(2, "0")}:${(whole % 60).toString().padStart(2, "0")}`;
};

const setScales = (bars: (HTMLSpanElement | null)[], levels: readonly number[]) => {
  bars.forEach((bar, i) => {
    if (bar) bar.style.transform = `scaleY(${(levels[i] ?? REST_LEVEL).toFixed(3)})`;
  });
};

interface AIVoiceProps {
  className?: string;
  /** Live input level from 0 to 1, from the microphone's analyser. */
  level?: number;
  /** True while the parent is recording; the control mirrors it. */
  recording: boolean;
  disabled?: boolean;
  /** Line under the control when idle. */
  caption?: string;
  /** Called when the hold starts. */
  onHoldStart: () => void;
  /** Called when the hold ends, with how long it lasted in seconds. */
  onHoldEnd: (seconds: number) => void;
}

export default function AI_Voice({
  className,
  level,
  recording,
  disabled = false,
  caption = "Hold to ask",
  onHoldStart,
  onHoldEnd,
}: AIVoiceProps) {
  const [seconds, setSeconds] = useState(0);
  const shouldReduceMotion = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLSpanElement>(null);
  const barRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const startedAtRef = useRef(0);
  const holdingRef = useRef(false);
  const levelRef = useRef(level);
  useEffect(() => {
    levelRef.current = level;
  }, [level]);

  // Recording: one rAF loop writes transforms straight to the bars and the ring.
  useEffect(() => {
    const bars = barRefs.current;
    const row = rowRef.current;
    const ring = ringRef.current;
    if (!(recording && row && ring)) return;
    if (shouldReduceMotion) {
      setScales(bars, STILL_LEVELS);
      return;
    }
    const samples = BAR_IDS.map(() => REST_LEVEL);
    let phase = 0;
    let smooth = 0;
    let last = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const dt = Math.min(now - last, 100);
      last = now;
      phase += dt / SAMPLE_MS;
      while (phase >= 1) {
        phase -= 1;
        samples.shift();
        samples.push(Math.max(REST_LEVEL, Math.min(1, levelRef.current ?? REST_LEVEL)));
      }
      row.style.transform = `translateX(${(-phase * BAR_PITCH).toFixed(2)}px)`;
      setScales(bars, samples);
      const latest = samples.at(-1) ?? REST_LEVEL;
      smooth += (latest - smooth) * 0.18;
      const lift = Math.max(0, smooth - REST_LEVEL);
      ring.style.transform = `scale(${(1 + lift * 0.22).toFixed(3)})`;
      ring.style.opacity = (0.4 + lift * 0.8).toFixed(3);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      ring.style.transform = "scale(1)";
      ring.style.opacity = "0";
      row.style.transform = "translateX(0px)";
      setScales(bars, BAR_IDS.map(() => REST_LEVEL));
    };
  }, [recording, shouldReduceMotion]);

  // Recording timer. It is reset to zero when a hold starts.
  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => setSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000)), 250);
    return () => clearInterval(id);
  }, [recording]);

  const start = () => {
    if (disabled || holdingRef.current) return;
    holdingRef.current = true;
    startedAtRef.current = Date.now();
    setSeconds(0);
    onHoldStart();
  };
  const end = () => {
    if (!holdingRef.current) return;
    holdingRef.current = false;
    onHoldEnd((Date.now() - startedAtRef.current) / 1000);
  };

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    start();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== " ") return;
    event.preventDefault();
    if (!event.repeat) start();
  };
  const onKeyUp = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== " ") return;
    event.preventDefault();
    end();
  };

  return (
    <div className={cn("w-full", className)} ref={rootRef}>
      <div className="relative mx-auto flex w-full flex-col items-center gap-2">
        <div className="relative">
          {/* Swells with the voice while recording. */}
          <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-brass/30 opacity-0" ref={ringRef} />
          <button
            aria-disabled={disabled || undefined}
            aria-label={recording ? "Recording. Release to send." : "Hold to ask"}
            aria-pressed={recording}
            className={cn(
              "relative flex size-20 touch-none select-none items-center justify-center outline-none transition-colors duration-150 ease-out",
              recording ? "bg-brass text-ink" : "bg-ink text-paper hover:bg-ink/85",
              disabled && "cursor-not-allowed opacity-50 hover:bg-ink",
            )}
            data-testid="talk"
            onContextMenu={(e) => e.preventDefault()}
            onKeyDown={onKeyDown}
            onKeyUp={onKeyUp}
            onLostPointerCapture={end}
            onPointerCancel={end}
            onPointerDown={onPointerDown}
            onPointerUp={end}
            type="button"
          >
            {recording ? (
              <span aria-hidden="true" className="size-6 bg-ink" />
            ) : (
              <Mic aria-hidden="true" className="size-8" />
            )}
          </button>
        </div>

        <span className={cn("figures relative text-sm", recording ? "text-ink" : "text-ink-muted")}>
          {/* A steady lamp while recording, like a recorder's REC light. */}
          <span
            aria-hidden="true"
            className={cn(
              "absolute top-1/2 right-full mr-2 size-1.5 -translate-y-1/2 rounded-full bg-copper transition-opacity duration-150",
              recording ? "opacity-100" : "opacity-0",
            )}
          />
          {formatTime(recording ? seconds : 0)}
        </span>

        <div
          aria-hidden="true"
          className="relative h-8 w-60 overflow-hidden"
          style={{ maskImage: recording ? EDGE_MASK : undefined, WebkitMaskImage: recording ? EDGE_MASK : undefined }}
        >
          <div className="flex h-full items-center gap-[2px]" ref={rowRef}>
            {BAR_IDS.map((id, i) => (
              <span
                className={cn(
                  "h-full w-[3px] shrink-0",
                  recording ? "bg-ink/70" : "bg-ink/20 transition-transform duration-500 motion-reduce:transition-none",
                )}
                key={id}
                ref={(el) => {
                  barRefs.current[i] = el;
                }}
                style={{ transform: `scaleY(${REST_LEVEL})` }}
              />
            ))}
          </div>
        </div>

        <p className="text-ink-muted text-sm">{recording ? "Listening… let go to send" : caption}</p>
      </div>
    </div>
  );
}
