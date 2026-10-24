"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export const MAX_QUESTION_CHARS = 300;
export const DEVICE_POLL_MS = 1_500;

/** Ask by typing. Sends the text as the question; the desktop skips speech-to-text. */
export function TypeQuestion({ disabled, onAsk }: { disabled: boolean; onAsk: (text: string) => void }) {
  const [text, setText] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const question = text.trim();
    if (!question || disabled) return;
    onAsk(question);
    setText("");
  };
  return (
    <form className="flex w-full flex-col gap-2" onSubmit={submit}>
      <label className="font-semibold text-sm" htmlFor="question">
        What are you looking for?
      </label>
      <input
        autoComplete="off"
        className="h-11 w-full border border-rule bg-card-row px-3 text-[16px] outline-none focus-visible:border-brass-ink"
        id="question"
        maxLength={MAX_QUESTION_CHARS}
        onChange={(e) => setText(e.target.value)}
        placeholder="Where are my keys?"
        value={text}
      />
      <button
        className="h-11 bg-brass font-semibold text-ink transition-colors hover:bg-brass/85 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={disabled || !text.trim()}
        type="submit"
      >
        Ask
      </button>
    </form>
  );
}

/**
 * Ask with the camera's own button and mic. The Pi uploads the recording and queues
 * the job; this waits for a new camera job and hands it to the page. In mock mode a
 * press can be simulated.
 */
export function CameraButton({
  listening,
  cameraOnline,
  onJob,
}: {
  listening: boolean;
  cameraOnline: boolean;
  onJob: (id: string) => void;
}) {
  const sinceRef = useRef(new Date().toISOString());
  const [canSimulate, setCanSimulate] = useState(false);
  const [pressing, setPressing] = useState(false);

  useEffect(() => {
    fetch("/api/mock/device-press")
      .then((r) => setCanSimulate(r.ok))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!listening) return;
    let alive = true;
    let timer = 0;
    const poll = async () => {
      try {
        const res = await fetch(
          `/api/jobs/latest?source=device&since=${encodeURIComponent(sinceRef.current)}`,
          { cache: "no-store" },
        );
        if (alive && res.status === 200) {
          const { id } = await res.json();
          sinceRef.current = new Date().toISOString();
          onJob(id);
          return;
        }
      } catch {
        // Try again on the next tick.
      }
      if (alive) timer = window.setTimeout(poll, DEVICE_POLL_MS);
    };
    timer = window.setTimeout(poll, DEVICE_POLL_MS);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [listening, onJob]);

  const simulate = async () => {
    setPressing(true);
    try {
      await fetch("/api/mock/device-press", { method: "POST" });
    } finally {
      setPressing(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-3 text-center" data-testid="camera-button">
      {/* A brass push button on its plate: the button on the camera. */}
      <svg aria-hidden className="size-20" viewBox="0 0 80 80">
        <rect fill="var(--ink)" height="80" width="80" />
        <circle cx="40" cy="40" fill="var(--brass-ink)" r="27" />
        <circle className={cn(listening && "motion-safe:animate-pulse")} cx="40" cy="40" fill="var(--brass)" r="20" />
        <circle cx="34" cy="34" fill="var(--paper)" opacity="0.35" r="6" />
      </svg>
      <p className="text-sm">
        {listening ? "Listening for the camera button…" : "Working on the camera's question"}
      </p>
      {!cameraOnline && <p className="text-copper text-sm">The camera is offline, so its button cannot be heard.</p>}
      {canSimulate && listening && (
        <button
          className="border border-rule bg-card-row px-3 py-1.5 text-sm transition-colors hover:bg-panel disabled:opacity-50"
          disabled={pressing}
          onClick={simulate}
          type="button"
        >
          Simulate a button press (mock mode)
        </button>
      )}
    </div>
  );
}
