"use client";

/**
 * @author: @kokonutui
 * @description: Synced Transcript
 * @version: 1.0.0
 * @license: MIT
 * @website: https://kokonutui.com
 * @github: https://github.com/kokonut-labs/kokonutui
 *
 * Ctrl-F adaptation: one paragraph (the narrator's reply) driven by a real <audio>
 * element instead of simulated playback. Word times come from the reply's timings;
 * without them the text shows plainly and nothing moves. One autoplay attempt is made
 * on mount; if the browser blocks it, the play button is the way to start. The
 * speaker lanes and scroll-follow of the original are dropped: a reply is two lines.
 */

import { Pause, Play } from "lucide-react";
import {
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";

const SPEEDS = [1, 1.25, 1.5];
const WHITESPACE = /\s+/;

export interface WordTime {
  word: string;
  /** Seconds from the start of the audio. */
  start: number;
  end: number;
}

export interface SyncedTranscriptProps {
  text: string;
  /** Reply audio. Leave out for a text-only reply. */
  src?: string | null;
  timings?: WordTime[] | null;
  /** Try to play once on mount. */
  autoPlay?: boolean;
  /** Called when the browser refuses autoplay. */
  onAutoplayBlocked?: () => void;
  /** Ctrl-F: told when the audio starts and stops, so the narrator can speak. */
  onPlayingChange?: (playing: boolean) => void;
  className?: string;
}

interface Word {
  text: string;
  start: number;
  index: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function formatTime(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function SyncedTranscript({
  text,
  src,
  timings,
  autoPlay = true,
  onAutoplayBlocked,
  onPlayingChange,
  className,
}: SyncedTranscriptProps) {
  const words: Word[] = useMemo(
    () =>
      timings?.length
        ? timings.map((t, index) => ({ text: t.word, start: t.start, index }))
        : text
            .split(WHITESPACE)
            .filter(Boolean)
            .map((w, index) => ({ text: w, start: Number.POSITIVE_INFINITY, index })),
    [text, timings],
  );
  const synced = Boolean(timings?.length && src);

  const audioRef = useRef<HTMLAudioElement>(null);
  const contentRef = useRef<HTMLSpanElement>(null);
  const markRef = useRef<HTMLSpanElement>(null);
  const lastTop = useRef<number | null>(null);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(timings?.at(-1)?.end ?? 0);
  const [playing, setPlaying] = useState(false);
  const [speedIndex, setSpeedIndex] = useState(0);
  const rate = SPEEDS[speedIndex];

  // Follow the audio clock every frame while it plays.
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const tick = () => {
      const audio = audioRef.current;
      if (audio) setTime(audio.currentTime);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = rate;
  }, [rate]);

  useEffect(() => {
    onPlayingChange?.(playing);
  }, [playing, onPlayingChange]);
  useEffect(() => () => onPlayingChange?.(false), [onPlayingChange]);

  // One autoplay attempt per reply.
  useEffect(() => {
    const audio = audioRef.current;
    if (!(autoPlay && audio && src)) return;
    audio.play().catch(() => onAutoplayBlocked?.());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  const seek = useCallback(
    (seconds: number) => {
      const audio = audioRef.current;
      const next = clamp(seconds, 0, duration || 0);
      if (audio) audio.currentTime = next;
      setTime(next);
    },
    [duration],
  );

  let active = -1;
  if (synced) {
    for (const word of words) {
      if (word.start <= time) active = word.index;
      else break;
    }
    if (!playing && time === 0) active = -1;
  }

  // One highlight slides from word to word; it jumps, unanimated, to a new line.
  useLayoutEffect(() => {
    const mark = markRef.current;
    const el = contentRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    if (!(mark && el)) {
      if (mark) mark.style.opacity = "0";
      lastTop.current = null;
      return;
    }
    const sameLine = lastTop.current === el.offsetTop;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    mark.style.transition =
      sameLine && !reduce
        ? "transform 140ms cubic-bezier(0.23, 1, 0.32, 1), width 140ms cubic-bezier(0.23, 1, 0.32, 1), opacity 150ms ease-out"
        : "none";
    const space = Number.parseFloat(getComputedStyle(el).fontSize) * 0.28;
    mark.style.transform = `translate(${el.offsetLeft - 3}px, ${el.offsetTop}px)`;
    mark.style.width = `${el.offsetWidth - space + 6}px`;
    mark.style.height = `${el.offsetHeight}px`;
    mark.style.opacity = "1";
    lastTop.current = el.offsetTop;
  }, [active]);

  const handleWordClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (!synced) return;
    const target = (event.target as HTMLElement).closest("[data-index]");
    const index = Number(target?.getAttribute("data-index") ?? -1);
    seek(index >= 0 ? (words[index]?.start ?? 0) : 0);
    audioRef.current?.play().catch(() => undefined);
  };

  const handleProgress = (event: PointerEvent<HTMLDivElement>) => {
    if (event.type === "pointerdown") {
      event.currentTarget.setPointerCapture(event.pointerId);
    } else if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    seek(((event.clientX - rect.left) / rect.width) * duration);
  };

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      if (audio.ended) audio.currentTime = 0;
      audio.play().catch(() => undefined);
    } else {
      audio.pause();
    }
  };

  const handleProgressKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, number> = { ArrowLeft: -2, ArrowDown: -2, ArrowRight: 2, ArrowUp: 2, Home: -duration, End: duration };
    if (event.key === " ") {
      event.preventDefault();
      togglePlay();
      return;
    }
    const move = moves[event.key];
    if (move !== undefined) {
      event.preventDefault();
      seek(time + move);
    }
  };

  return (
    <div className={cn("w-full select-none text-ink", className)}>
      <div className="relative">
        <button
          className="relative isolate block w-full cursor-default text-left text-[19px] leading-8 outline-none data-[synced=true]:cursor-pointer"
          data-synced={synced}
          onClick={handleWordClick}
          tabIndex={-1}
          type="button"
        >
          <span className="block" ref={contentRef}>
            <span aria-hidden className="pointer-events-none absolute top-0 left-0 -z-10 block bg-brass/25 opacity-0" ref={markRef} />
            {words.map((word) => (
              <span
                className={cn(
                  "transition-colors duration-150 ease-out",
                  synced && word.index > active && active >= 0 ? "text-ink-muted" : "text-ink",
                )}
                data-current={word.index === active || undefined}
                data-index={word.index}
                key={word.index}
              >
                {word.text}{" "}
              </span>
            ))}
          </span>
        </button>
      </div>

      {src && (
        <div className="mt-4 flex items-center gap-3">
          {/* biome-ignore lint/a11y/useMediaCaption: the reply text above is the caption */}
          <audio
            onDurationChange={(e) => Number.isFinite(e.currentTarget.duration) && setDuration(e.currentTarget.duration)}
            onEnded={() => setPlaying(false)}
            onPause={() => setPlaying(false)}
            onPlay={() => setPlaying(true)}
            preload="auto"
            ref={audioRef}
            src={src}
          />
          <button
            aria-label={playing ? "Pause the reply" : "Play the reply"}
            className="flex size-9 shrink-0 items-center justify-center bg-ink text-paper outline-none transition-colors duration-150 ease-out hover:bg-ink/85"
            data-testid="reply-play"
            onClick={togglePlay}
            type="button"
          >
            {playing ? (
              <Pause aria-hidden className="size-4" fill="currentColor" />
            ) : (
              <Play aria-hidden className="size-4 translate-x-px" fill="currentColor" />
            )}
          </button>
          <span className="figures w-9 text-ink-muted text-sm">{formatTime(time)}</span>
          <div
            aria-label="Seek"
            aria-valuemax={Math.round(duration)}
            aria-valuemin={0}
            aria-valuenow={Math.round(time)}
            aria-valuetext={`${formatTime(time)} of ${formatTime(duration)}`}
            className="group relative flex h-6 flex-1 cursor-pointer touch-none items-center outline-none"
            onKeyDown={handleProgressKey}
            onPointerDown={handleProgress}
            onPointerMove={handleProgress}
            role="slider"
            tabIndex={0}
          >
            <div className="h-1 w-full overflow-hidden bg-rule">
              <div
                className="h-full w-full origin-left bg-ink"
                style={{ transform: `scaleX(${duration ? time / duration : 0})` }}
              />
            </div>
          </div>
          <span className="figures w-9 text-right text-ink-muted text-sm">{formatTime(duration)}</span>
          <button
            aria-label={`Playback speed ${rate} times`}
            className="figures h-8 shrink-0 border border-rule px-2.5 text-sm outline-none transition-colors duration-150 ease-out hover:bg-panel"
            onClick={() => setSpeedIndex((i) => (i + 1) % SPEEDS.length)}
            type="button"
          >
            {rate}×
          </button>
        </div>
      )}
    </div>
  );
}
