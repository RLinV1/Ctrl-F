"use client";

import Link from "next/link";
import { Pause, Play, X } from "lucide-react";
import { type ReactNode, type RefObject, useEffect, useRef, useState } from "react";
import type { Box, JobView, Snapshot } from "@/lib/data/types";
import { exactTime, percent, placeWords } from "@/lib/format";
import { prefersReducedMotion } from "@/lib/motion/use-anime";
import { cn } from "@/lib/utils";
import { CogTrain } from "./cog-train";
import { SnapshotFrame } from "./snapshot-frame";

/*
 * The Ask page as a visual novel: the narrator stands in a brass-panelled study, and a
 * dialogue box with his name tag speaks for him. When an answer arrives, the camera's
 * photo slides onto the stage behind the box and his reply plays by itself, its words
 * appearing as they are spoken. The ▼ shows the camera's photo full size, and its ✕ closes
 * it again, back to him in his study. Render it with `key={answer.id}` so each answer
 * starts afresh.
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

type StagePhoto = { snapshot: Snapshot; lens: { box: Box; confidence?: number | null } | null };

/** The photo behind the narrator: the item circled where it was found, else the camera's photo for this question, else the last photo of the item. */
function photoOf(answer: JobView | null): StagePhoto | null {
  if (!answer) return null;
  if (answer.found && answer.match) {
    return { snapshot: answer.match.snapshot, lens: { box: answer.match.box, confidence: answer.match.confidence } };
  }
  if (answer.lastSighting && !answer.found) return { snapshot: answer.lastSighting.snapshot, lens: { box: answer.lastSighting.box } };
  if (answer.photo) return { snapshot: answer.photo, lens: null };
  return null;
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
  // The voice is still being made: hold the text so it appears with the speech, not before it.
  const waiting = Boolean(answer?.replyPending);
  useEffect(() => {
    if (timed || waiting || !id) return;
    const handle = window.setInterval(() => setTyped((n) => (n >= total ? n : n + 1)), TYPE_MS * 4);
    return () => window.clearInterval(handle);
  }, [timed, waiting, id, total]);

  let shown = total;
  let current = -1;
  if (waiting) {
    shown = 0;
  } else if (timed && !ended) {
    const starts = answer!.replyTimings!.map((t) => t.start);
    const spoken = starts.filter((s) => s <= time).length;
    // Under reduced motion the whole reply shows at once; the spoken word is still marked.
    if (!reduced) shown = playing || time > 0 ? Math.max(1, spoken) : 0; // audio loaded but not started: show nothing yet
    current = playing ? spoken - 1 : -1;
  } else if (!timed && !reduced && !ended) {
    shown = typed;
  }
  // Finished: the voice ended, or (with no voice) the last word has been typed. While the
  // voice is still being made, he is not finished: it may yet arrive and be played.
  const done = !answer?.replyPending && (answer?.replyAudioUrl ? ended : total > 0 && (reduced || typed >= total));
  return { words, shown, current, done, onEnded: () => setEnded(true) };
}

export function Stage({
  line,
  answer,
  working,
  onSettled,
  onPhotoView,
  remark,
}: {
  /** What the narrator says when there is no answer to read. */
  line: ReactNode;
  answer: JobView | null;
  working: boolean;
  onSettled?: () => void;
  /** Told whenever the full camera photo is shown or hidden, so steam left over can clear off it. */
  onPhotoView?: (shown: boolean) => void;
  /** The narrator's quip on the photo being taken, spoken while the question is still unanswered. */
  remark?: JobView["remark"];
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  // The remark: spoken once per question per browser session. Its text shows while he says it (or
  // stays, if the browser blocked the voice); then the dialogue goes back to the status line.
  // The answer replaces this whole stage, which stops a remark still playing.
  const remarkRef = useRef<HTMLAudioElement>(null);
  const [remarkSaid, setRemarkSaid] = useState<"no" | "saying" | "said">("no");
  const remarkUrl = remark?.audioUrl;
  useEffect(() => {
    const audio = remarkRef.current;
    if (!(remarkUrl && audio)) return;
    const key = `ctrlf-remarked:${remarkUrl}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch { /* private storage: still play it once in this stage */ }
    audio.play().catch(() => setRemarkSaid("saying")); // blocked: show the words without the voice
    return () => audio.pause();
  }, [remarkUrl]);
  const [playing, setPlaying] = useState(false);
  const [blocked, setBlocked] = useState(() => {
    try { return Boolean(answer?.id && sessionStorage.getItem(`ctrlf-played:${answer.id}`)); }
    catch { return false; }
  });
  // The answer plays out in three steps: the narrator talks in his study; when he is done the
  // study fades away to reveal the camera's photo behind him; then he and his box fade out,
  // leaving the photo. The ▼ skips ahead to the photo, and the photo's ✕ brings him back.
  const [view, setView] = useState<"talk" | "reveal" | "photo">("talk");
  const photo = photoOf(answer);
  const name = answer?.target ?? "item";
  const { words, shown, current, done, onEnded } = useReveal(answer, audioRef, playing, blocked);
  useEffect(() => { if (done && !blocked) onSettled?.(); }, [done, blocked, onSettled]);
  const autoPlayed = useRef(false);
  // Once the user clicks ▼ or ✕, the automatic talk-then-photo sequence stands down.
  const manual = useRef(false);
  const hasVoice = Boolean(answer?.replyAudioUrl);
  const hasPhoto = Boolean(photo);
  useEffect(() => {
    // Once per answer, and not when the browser blocked the voice (the text must stay readable).
    if (!(hasPhoto && done && !blocked) || autoPlayed.current || manual.current) return;
    autoPlayed.current = true;
    const reveal = window.setTimeout(() => { if (!manual.current) setView((v) => (v === "talk" ? "reveal" : v)); }, hasVoice ? 500 : 1500);
    const leave = window.setTimeout(() => { if (!manual.current) setView("photo"); }, hasVoice ? 1500 : 2500);
    return () => {
      window.clearTimeout(reveal);
      window.clearTimeout(leave);
    };
  }, [hasPhoto, done, blocked, hasVoice]);
  const photoView = Boolean(photo) && view === "photo";
  useEffect(() => { onPhotoView?.(photoView); }, [photoView, onPhotoView]);

  // Play the reply once, as soon as its audio is there (with the text, or a moment after it).
  const audioUrl = answer?.replyAudioUrl;
  const answerId = answer?.id;
  useEffect(() => {
    const audio = audioRef.current;
    if (!(audioUrl && audio)) return;
    const key = `ctrlf-played:${answerId}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch { /* private storage does not prevent explicit playback */ }
    audio.currentTime = 0;
    audio.play().catch(() => setBlocked(true));
    return () => audio.pause();
  }, [audioUrl, answerId]);

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
        {answer.match.locationDescription ? ` · ${answer.match.locationDescription}` : place ? ` · on ${place}` : ""}
        {answer.match.confidence != null && <> · <span className="figures">{percent(answer.match.confidence)} sure</span></>}
      </span>
    );
  } else if (answer?.found) {
    // Found on the user's word: there is no box to draw.
    caption = (
      <span data-testid="found-caption">
        <span className="font-semibold first-letter:uppercase">{name}</span> · in the photo, by your word
      </span>
    );
  }

  if (!answer?.found && answer?.lastSighting) {
    const prior = answer.lastSighting;
    caption = <span data-testid="last-seen-caption">Not in view now. Last seen {exactTime(prior.seenAt)}
      {prior.locationDescription ? ` · ${prior.locationDescription}` : prior.zone ? ` · ${prior.zone}` : ""}.
      {answer.itemId && <> <Link className="underline" href={`/items/${answer.itemId}`}>View history</Link></>}
    </span>;
  } else if (answer?.found === false) {
    caption = <span data-testid="memory-status">{answer.historyStatus === "never_seen"
      ? "The camera has not seen this item before." : "Not in view now. History cannot currently be checked."}</span>;
  }

  return (
    // The frame and its steam sit outside (ask-panel.tsx), so they last from one answer to the next.
    <div className="relative aspect-[4/3] w-full overflow-hidden bg-ink sm:aspect-video" data-testid="stage">
        {photo && (
          // While shown, the photo sits above the steam layer (z-10), so steam can never wash over it.
          <div
            aria-hidden={view === "talk"}
            className={cn("absolute inset-0", photoView && "z-[15]")}
            data-shown={photoView || undefined}
            data-testid="camera-view"
          >
            <figure className="h-full w-full" data-testid={answer?.found ? "found" : "not-found"}>
              <SnapshotFrame
                alt={
                  photo.lens && answer?.found
                    ? `Camera photo with the ${name} circled`
                    : photo.lens
                      ? `Last photo with the ${name}`
                      : "The camera's photo for this question"
                }
                className="h-full"
                height={photo.snapshot.height}
                key={`${answer?.id}-${photo.snapshot.id}`}
                lens={photo.lens ? { box: photo.lens.box, label: name, confidence: photo.lens.confidence } : undefined}
                priority
                src={photo.snapshot.url}
                width={photo.snapshot.width}
              />
            </figure>
          </div>
        )}
        <div
          className={cn(
            "absolute inset-0 transition-opacity duration-700 ease-out",
            photo && view !== "talk" ? "opacity-0" : "opacity-100",
          )}
          data-testid="backdrop"
        >
          <Backdrop />
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element -- a transparent PNG; the optimiser is off locally */}
        <img
          alt="The narrator, a detective in a deerstalker with brass goggles and a pipe"
          className={cn(
            "absolute bottom-0 left-1/2 h-[92%] w-auto max-w-none -translate-x-1/2 select-none transition-[opacity,translate] duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-opacity",
            photoView ? "translate-y-[6%] opacity-0" : "translate-y-0 opacity-100",
          )}
          data-narrator-shown={!photoView || undefined}
          draggable={false}
          src="/narrator.png"
        />

        {caption && (!photo || photoView) && (
          <p className="absolute top-3 left-3 z-20 max-w-[80%] bg-ink/85 px-3 py-1.5 text-paper text-sm">{caption}</p>
        )}
        {photoView && (
          // Close the photo and go back to the narrator in his study; the ▼ brings the photo back.
          <button
            aria-label="Close the photo and return to the narrator"
            className="vn-close absolute top-3 right-3 z-20 flex size-10 items-center justify-center"
            data-testid="close-photo"
            onClick={() => { manual.current = true; setView("talk"); }}
            type="button"
          >
            <X aria-hidden className="size-5" strokeWidth={2.5} />
          </button>
        )}

        {/* The dialogue box, as in a visual novel: a name tag and the narrator's line. */}
        <section
          aria-label="Narrator"
          aria-live="polite"
          aria-hidden={photoView || undefined}
          className={cn(
            "vn-panel absolute inset-x-[3%] bottom-[4%] z-20 min-h-[30%] px-6 pt-7 pb-4 text-paper transition-[opacity,translate] duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-opacity",
            photoView ? "pointer-events-none translate-y-[6%] opacity-0" : "translate-y-0 opacity-100",
          )}
          data-testid={answer ? "answer" : "dialogue"}
        >
          {/* Brass rivets in the panel's corners. */}
          {(["top-1.5 left-1.5", "top-1.5 right-1.5", "bottom-1.5 left-1.5", "bottom-1.5 right-1.5"] as const).map((at) => (
            <span aria-hidden className={cn("vn-rivet absolute", at)} key={at} />
          ))}
          {/* The speaker's nameplate: engraved brass, riveted at each end. */}
          <span className="vn-nameplate absolute -top-5 left-5 flex items-center gap-2.5 px-3 py-1 font-heading font-bold text-ink text-lg tracking-wide">
            <span aria-hidden className="vn-rivet" />
            {SPEAKER}
            <span aria-hidden className="vn-rivet" />
          </span>
          {answer?.transcript && <p className="mb-1 text-paper/70 text-sm">You asked: “{answer.transcript}”</p>}
          {answer ? (
            <p className="text-[19px] leading-snug sm:text-[22px]">
              {words.map((w, i) => (
                <span
                  className={cn(i < shown ? "opacity-100" : "opacity-0", i === current && "text-[#e2bf74]")}
                  data-current={i === current || undefined}
                  key={i}
                >
                  {w}{" "}
                </span>
              ))}
            </p>
          ) : (
            <div className="flex items-start justify-between gap-4">
              <div className="text-[19px] leading-snug sm:text-[22px]">
                {remark && remarkSaid === "saying" ? <span data-testid="remark">{remark.text}</span> : line}
              </div>
              {working && <CogTrain className="shrink-0" label="Working on it" />}
            </div>
          )}

          <div className="mt-3 flex items-center justify-end gap-3">
            {blocked && <span className="text-paper/80 text-sm">Press play to hear the answer.</span>}
            {answer?.replyAudioUrl && (
              <button
                aria-label={playing ? "Pause the reply" : "Play the reply"}
                className="vn-button flex size-9 items-center justify-center text-ink"
                data-testid="reply-play"
                onClick={toggle}
                type="button"
              >
                {playing ? <Pause aria-hidden className="size-4" fill="currentColor" /> : <Play aria-hidden className="size-4 translate-x-px" fill="currentColor" />}
              </button>
            )}
            {photo && !photoView && (
              // The visual novel's "next" arrow: it bobs to invite a click, dips on hover, and
              // skips ahead to the camera's photo.
              <button
                aria-label="Show the camera's photo"
                className="group flex size-9 items-center justify-center text-[#e2bf74] outline-none focus-visible:ring-2 focus-visible:ring-[#e2bf74]"
                data-testid="next"
                onClick={() => { manual.current = true; setView("photo"); onSettled?.(); }}
                type="button"
              >
                <span className="motion-safe:animate-[vn-nudge_1.1s_ease-in-out_infinite] group-hover:[animation-play-state:paused]">
                  <svg
                    aria-hidden
                    className="block h-3 w-4 transition-transform duration-200 ease-out group-hover:translate-y-1"
                    viewBox="0 0 16 12"
                  >
                    <polygon fill="currentColor" points="0,0 16,0 8,12" />
                  </svg>
                </span>
              </button>
            )}
          </div>
          {!answer && remark && (
            // biome-ignore lint/a11y/useMediaCaption: the dialogue box shows the remark's words
            <audio
              data-testid="remark-audio"
              onEnded={() => setRemarkSaid("said")}
              onPlay={() => setRemarkSaid("saying")}
              preload="auto"
              ref={remarkRef}
              src={remark.audioUrl}
            />
          )}
          {answer?.replyAudioUrl && (
            // biome-ignore lint/a11y/useMediaCaption: the dialogue box is the caption
            <audio
              onEnded={() => {
                setPlaying(false);
                onEnded();
              }}
              onError={() => setBlocked(true)}
              onPause={() => setPlaying(false)}
              onPlay={() => setPlaying(true)}
              preload="auto"
              ref={audioRef}
              src={answer.replyAudioUrl}
            />
          )}
        </section>
    </div>
  );
}
