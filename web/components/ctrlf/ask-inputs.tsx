"use client";

import { Mic, Square } from "lucide-react";
import { type KeyboardEvent, type PointerEvent, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

export const DEVICE_POLL_MS = 1_500;

/**
 * The prompt's mic button for "Speak here": hold to record (pointer, or Space while it has
 * focus), let go to send. Exposes `data-live` once hydrated, so tests know it is ready.
 */
export function HoldToTalk({
  recording,
  disabled,
  onHoldStart,
  onHoldEnd,
}: {
  recording: boolean;
  disabled: boolean;
  onHoldStart: () => void;
  onHoldEnd: (seconds: number) => void;
}) {
  const live = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  const holding = useRef(false);
  const startedAt = useRef(0);

  const start = () => {
    if (disabled || holding.current) return;
    holding.current = true;
    startedAt.current = Date.now();
    onHoldStart();
  };
  const end = () => {
    if (!holding.current) return;
    holding.current = false;
    onHoldEnd((Date.now() - startedAt.current) / 1000);
  };

  return (
    <button
      aria-disabled={disabled || undefined}
      aria-label={recording ? "Recording. Release to send." : "Hold to ask"}
      aria-pressed={recording}
      className={cn(
        "flex h-9 shrink-0 touch-none select-none items-center gap-2 px-3 font-semibold text-sm outline-none transition-colors duration-150",
        "focus-visible:ring-2 focus-visible:ring-brass",
        recording ? "bg-brass text-ink" : "bg-ink text-paper hover:bg-ink/85",
        disabled && "cursor-not-allowed opacity-50 hover:bg-ink",
      )}
      data-live={live || undefined}
      data-testid="talk"
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e: KeyboardEvent<HTMLButtonElement>) => {
        if (e.key !== " ") return;
        e.preventDefault();
        if (!e.repeat) start();
      }}
      onKeyUp={(e: KeyboardEvent<HTMLButtonElement>) => {
        if (e.key !== " ") return;
        e.preventDefault();
        end();
      }}
      onLostPointerCapture={end}
      onPointerCancel={end}
      onPointerDown={(e: PointerEvent<HTMLButtonElement>) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        start();
      }}
      onPointerUp={end}
      type="button"
    >
      {recording ? <Square aria-hidden className="size-3.5" fill="currentColor" /> : <Mic aria-hidden className="size-4" />}
      {recording ? "Release to send" : "Hold to talk"}
    </button>
  );
}

/** Seconds since `since` while `running`, ticking four times a second. */
export function useElapsed(running: boolean) {
  const [seconds, setSeconds] = useState(0);
  const startedAt = useRef(0);
  useEffect(() => {
    if (!running) return;
    startedAt.current = Date.now();
    const id = window.setInterval(() => setSeconds((Date.now() - startedAt.current) / 1000), 250);
    return () => {
      window.clearInterval(id);
      setSeconds(0);
    };
  }, [running]);
  return seconds;
}

/**
 * While `listening`, watches for a new question asked at the camera (its button and mic)
 * and hands the job to `onJob`.
 */
export function useCameraJobs(listening: boolean, onJob: (id: string) => void) {
  const cursor = useRef<{since: string; afterId: string} | null>(null);
  useEffect(() => {
    if (!cursor.current) {
      try { cursor.current = JSON.parse(sessionStorage.getItem("ctrlf-device-cursor") || "null"); } catch { /* unavailable */ }
      // A fresh session starts now: requests made before the page opened are never replayed.
      cursor.current ||= { since: new Date().toISOString(), afterId: "" };
    }
    if (!listening) return;
    let alive = true;
    let timer = 0;
    const poll = async () => {
      try {
        const {since, afterId} = cursor.current!;
        const res = await fetch(`/api/jobs/latest?source=device&since=${encodeURIComponent(since)}&afterId=${encodeURIComponent(afterId)}`, { cache: "no-store" });
        if (alive && res.status === 200) {
          const { id, createdAt } = await res.json();
          if (typeof id === "string" && typeof createdAt === "string" && Number.isFinite(Date.parse(createdAt))
            && (Date.parse(createdAt) > Date.parse(since) || (createdAt === since && id > afterId))) {
            cursor.current = { since: createdAt, afterId: id };
            try { sessionStorage.setItem("ctrlf-device-cursor", JSON.stringify(cursor.current)); } catch { /* unavailable */ }
            onJob(id);
          }
        }
      } catch { /* Retry without advancing the server cursor. */ }
      if (alive) timer = window.setTimeout(poll, DEVICE_POLL_MS);
    };
    timer = window.setTimeout(poll, DEVICE_POLL_MS);
    return () => { alive = false; window.clearTimeout(timer); };
  }, [listening, onJob]);
}
