"use client";

import { Pause, Play } from "lucide-react";
import Link from "next/link";
import { type ReactNode, type RefObject, useEffect, useRef, useState } from "react";
import type { JobView, Sighting } from "@/lib/data/types";
import { percent, placeWords, relativeTime } from "@/lib/format";
import { prefersReducedMotion } from "@/lib/motion/use-anime";
import { cn } from "@/lib/utils";
import { CogTrain } from "./cog-train";
import { SnapshotFrame } from "./snapshot-frame";

/*
 * The Ask page as a visual novel: the narrator stands in a brass-panelled study, and a
 * dialogue box with his name tag speaks for him. When an answer arrives, the camera's
 * photo slides onto the stage behind the box and his reply plays by itself, its words
 * appearing as they are spoken. Clicking the stage lowers the photo to show him; clicking
 * again raises it. Render it with `key={answer.id}` so each answer starts afresh.
 */

const SPEAKER = "Narrator";
const TYPE_MS = 22;

/** The study behind the narrator: brass wall panels under a cornice, like a courtroom wall. */
function Backdrop() {
  const panels = Array.from({ length: 6 }, (_, i) => 40 + i * 260);
  return (
    <svg aria-hidden className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice" viewBox="0 0 1600 900">
      <rect fill="#8a6326" height="900" width="1600" />
      <rect fill="#5a3f17" height="150" width="1600" />
      <rect fill="#c79a4a" height="18" width="1600" y="150" />
      <rect fill="#7a5418" height="10" width="1600" y="168" />
      {panels.map((x) => (
        <g key={x}>
          <rect fill="#a8772a" height="560" stroke="#6e4b15" strokeWidth="10" width="220" x={x} y="205" />
          <rect fill="none" height="500" stroke="#d2a85a" strokeWidth="4" width="160" x={x + 30} y="235" />
        </g>
      ))}
      <rect fill="#4e3418" height="135" width="1600" y="765" />
      <rect fill="#c79a4a" height="8" width="1600" y="765" />
    </svg>
  );
}

function photoOf(answer: JobView | null): Sighting | null {
  if (!answer) return null;
  if (answer.found && answer.match) return answer.match;
  return answer.lastSighting;
}

/** Words of the reply, revealed as they are spoken (timed), typed out (no audio), or all at once. */
function useReveal(answer: JobView | null, audioRef: RefObject<HTMLAudioElement | null>, playing: boolean, blocked: boolean) {
  const words = answer?.replyTimings?.length
    ? answer.replyTimings.map((t) => t.word)
    : (answer?.replyText ?? "").split(/\s+/).filter(Boolean);
  const timed = Boolean(answer?.replyTimings?.length && answer.replyAudioUrl) && !blocked;
  const [time, setTime] = useState(0);
  const [typed, setTyped] = useState(0);
  const [ended, setEnded] = useState(false);
  const reduced = typeof window !== "undefined" && prefersReducedMotion();
  // The stage is keyed by the answer, so each answer starts from fresh state.
  const id = answer?.id;

  // Follow the audio clock while it plays.
  useEffect(() => {
    const audio = audioRef.current;
    if (!(timed && playing && audio)) return;
    let frame = 0;
    const tick = () => {
      setTime(audio.currentTime);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [timed, playing, audioRef]);

  // Typewriter when there is no voice to follow.
  const total = words.length;
  useEffect(() => {
    if (timed || !id) return;
    const handle = window.setInterval(() => setTyped((n) => (n >= total ? n : n + 1)), TYPE_MS * 4);
    return () => window.clearInterval(handle);
  }, [timed, id, total]);

  let shown = total;
  let current = -1;
  if (timed && !ended) {
    const starts = answer!.replyTimings!.map((t) => t.start);
    const spoken = starts.filter((s) => s <= time).length;
    // Under reduced motion the whole reply shows at once; the spoken word is still marked.
    if (!reduced) shown = playing || time > 0 ? Math.max(1, spoken) : total;
    current = playing ? spoken - 1 : -1;
  } else if (!timed && !reduced && !ended) {
    shown = typed;
  }
  return { words, shown, current, onEnded: () => setEnded(true) };
}

export function Stage({
  line,
  answer,
  answeredAt,
  working,
  aside,
}: {
  /** What the narrator says when there is no answer to read. */
  line: ReactNode;
  answer: JobView | null;
  answeredAt: number;
  working: boolean;
  /** A note under the dialogue, e.g. the camera is offline. */
  aside?: ReactNode;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [photoShown, setPhotoShown] = useState(true);
  const photo = photoOf(answer);
  const name = answer?.target ?? "item";
  const { words, shown, current, onEnded } = useReveal(answer, audioRef, playing, blocked);

  // Play the reply once, as the photo appears. Keyed by the answer, so this runs per answer.
  const id = answer?.id;
  useEffect(() => {
    const audio = audioRef.current;
    if (!(id && audio && answer?.replyAudioUrl)) return;
    audio.currentTime = 0;
    audio.play().catch(() => setBlocked(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      setBlocked(false);
      if (audio.ended) audio.currentTime = 0;
      audio.play().catch(() => setBlocked(true));
    } else {
      audio.pause();
    }
  };

  let caption: ReactNode = null;
  if (answer?.found && answer.match) {
    const place = placeWords(answer.match.zone);
    caption = (
      <span data-testid="found-caption">
        <span className="font-semibold first-letter:uppercase">{name}</span>
        {place ? ` · on ${place}` : ""} · <span className="figures">{percent(answer.match.confidence)} sure</span>
      </span>
    );
  } else if (answer?.lastSighting) {
    const place = placeWords(answer.lastSighting.zone);
    caption = (
      <span>
        Not in view · last seen {relativeTime(answer.lastSighting.seenAt, answeredAt)}
        {place ? ` on ${place}` : ""}
        {answer.itemId && (
          <>
            {" · "}
            <Link className="underline underline-offset-4" href={`/items/${answer.itemId}`} onClick={(e) => e.stopPropagation()}>
              See where the {name} {name.endsWith("s") ? "have" : "has"} been
            </Link>
          </>
        )}
      </span>
    );
  } else if (answer) {
    caption = (
      <span data-testid="never-seen">
        The camera has not seen the {name} yet. Put it somewhere in view and it will be remembered.
      </span>
    );
  }

  return (
    <div className="w-full max-w-[1040px]" data-testid="stage">
      {/* biome-ignore lint/a11y/useKeyWithClickEvents lint/a11y/noStaticElementInteractions: a convenience; the toggle button is the keyboard path */}
      <div
        className={cn("relative aspect-[4/3] w-full overflow-hidden bg-ink sm:aspect-video", photo && "cursor-pointer")}
        onClick={() => photo && setPhotoShown((s) => !s)}
      >
        <Backdrop />
        {/* eslint-disable-next-line @next/next/no-img-element -- a transparent PNG; the optimiser is off locally */}
        <img
          alt="The narrator, a detective in a deerstalker with brass goggles and a pipe"
          className="absolute bottom-0 left-1/2 h-[92%] w-auto max-w-none -translate-x-1/2 select-none"
          draggable={false}
          src="/narrator.png"
        />

        {photo && (
          <div
            aria-hidden={!photoShown}
            className={cn(
              "absolute inset-0 transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-opacity",
              photoShown ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-[18%] opacity-0",
            )}
            data-shown={photoShown || undefined}
            data-testid="camera-view"
          >
            <figure className="h-full w-full" data-testid={answer?.found ? "found" : "not-found"}>
              <SnapshotFrame
                alt={answer?.found ? `Camera photo with the ${name} circled` : `Last photo with the ${name}`}
                className="h-full"
                height={photo.snapshot.height}
                key={`${answer?.id}-${photo.snapshot.id}`}
                lens={{ box: photo.box, label: name, confidence: photo.confidence }}
                priority
                src={photo.snapshot.url}
                width={photo.snapshot.width}
              />
            </figure>
          </div>
        )}

        {caption && (
          <p className="absolute top-3 left-3 max-w-[80%] bg-ink/85 px-3 py-1.5 text-paper text-sm">{caption}</p>
        )}

        {/* The dialogue box, as in a visual novel: a name tag and the narrator's line. */}
        <section
          aria-label="Narrator"
          aria-live="polite"
          className="absolute inset-x-[3%] bottom-[4%] min-h-[30%] border-brass border-t-2 bg-ink/85 px-5 pt-6 pb-4 text-paper"
          data-testid={answer ? "answer" : "dialogue"}
          onClick={(e) => e.stopPropagation()}
        >
          <span className="absolute -top-4 left-4 bg-brass px-4 py-1 font-heading font-bold text-ink text-lg">{SPEAKER}</span>
          {answer?.transcript && <p className="mb-1 text-paper/70 text-sm">You asked: “{answer.transcript}”</p>}
          {answer ? (
            <p className="text-[19px] leading-snug sm:text-[22px]">
              {words.map((w, i) => (
                <span
                  className={cn(i < shown ? "opacity-100" : "opacity-0", i === current && "text-brass")}
                  data-current={i === current || undefined}
                  key={i}
                >
                  {w}{" "}
                </span>
              ))}
            </p>
          ) : (
            <div className="flex items-start justify-between gap-4">
              <div className="text-[19px] leading-snug sm:text-[22px]">{line}</div>
              {working && <CogTrain className="shrink-0" label="Working on it" />}
            </div>
          )}

          <div className="mt-3 flex items-center justify-end gap-3">
            {blocked && <span className="text-paper/80 text-sm">Press play to hear the answer.</span>}
            {photo && (
              <button
                className="border border-paper/40 px-3 py-1 text-sm hover:bg-paper/10"
                onClick={() => setPhotoShown((s) => !s)}
                type="button"
              >
                {photoShown ? "Show the narrator" : "Show the photo"}
              </button>
            )}
            {answer?.replyAudioUrl && (
              <button
                aria-label={playing ? "Pause the reply" : "Play the reply"}
                className="flex size-9 items-center justify-center bg-brass text-ink hover:bg-brass/85"
                data-testid="reply-play"
                onClick={toggle}
                type="button"
              >
                {playing ? <Pause aria-hidden className="size-4" fill="currentColor" /> : <Play aria-hidden className="size-4 translate-x-px" fill="currentColor" />}
              </button>
            )}
          </div>
          {answer?.replyAudioUrl && (
            // biome-ignore lint/a11y/useMediaCaption: the dialogue box is the caption
            <audio
              onEnded={() => {
                setPlaying(false);
                onEnded();
              }}
              onPause={() => setPlaying(false)}
              onPlay={() => setPlaying(true)}
              preload="auto"
              ref={audioRef}
              src={answer.replyAudioUrl}
            />
          )}
        </section>
      </div>
      {aside}
    </div>
  );
}
