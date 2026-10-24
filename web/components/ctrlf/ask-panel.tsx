"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import AILoadingState, { type AgentStep } from "@/components/kokonutui/ai-loading";
import AI_Voice from "@/components/kokonutui/ai-voice";
import ReceiptPrinter, { type SlipLine } from "@/components/kokonutui/receipt-printer";
import SyncedTranscript from "@/components/kokonutui/synced-transcript";
import type { JobView } from "@/lib/data/types";
import { clockTime, percent, placeWords, relativeTime } from "@/lib/format";
import { CogTrain } from "./cog-train";
import { Narrator } from "./narrator";
import { SnapshotFrame } from "./snapshot-frame";

export const POLL_MS = 750;
export const MIN_HOLD_S = 0.5;

type Mic = "unknown" | "ready" | "denied" | "unavailable";
type Phase =
  | { kind: "idle"; hint?: string }
  | { kind: "recording" }
  | { kind: "sending" }
  | { kind: "waiting"; job: JobView | null; jobId: string }
  | { kind: "answered"; job: JobView; at: number }
  | { kind: "failed"; message: string }
  | { kind: "offline" };

function pickMimeType(): string {
  const options = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return options.find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) ?? "";
}

const noSubscribe = () => () => undefined;
const canRecord = () => Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== "undefined";

/** The microphone: permission, a recorder per hold, and a live level for the waveform. */
function useRecorder() {
  const supported = useSyncExternalStore(noSubscribe, canRecord, () => true);
  const [permission, setMic] = useState<Mic>("unknown");
  const mic: Mic = supported ? permission : "unavailable";
  const [level, setLevel] = useState(0);
  const streamRef = useRef<Promise<MediaStream | null> | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const rafRef = useRef(0);

  /** Opens the microphone once; the first hold and the pre-warm share one request. */
  const ensureStream = useCallback(() => {
    streamRef.current ??= (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        setMic("ready");
        const ctx = new AudioContext();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        ctx.createMediaStreamSource(stream).connect(analyser);
        const data = new Uint8Array(analyser.fftSize);
        let shown = 0;
        const tick = () => {
          // Only while recording: the level drives the waveform, nothing else needs it.
          if (recorderRef.current) {
            analyser.getByteTimeDomainData(data);
            let peak = 0;
            for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
            shown = Math.min(1, (peak / 128) * 2.2);
            setLevel(shown);
          } else if (shown !== 0) {
            shown = 0;
            setLevel(0);
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        tick();
        return stream;
      } catch (error) {
        streamRef.current = null;
        setMic((error as DOMException)?.name === "NotAllowedError" ? "denied" : "unavailable");
        return null;
      }
    })();
    return streamRef.current;
  }, []);

  useEffect(() => {
    if (!canRecord()) return;
    navigator.permissions
      ?.query({ name: "microphone" as PermissionName })
      .then((p) => {
        if (p.state === "denied") setMic("denied");
        // Already allowed: open it now, so the first hold records from its first moment.
        if (p.state === "granted") ensureStream();
        p.onchange = () => setMic(p.state === "denied" ? "denied" : "unknown");
      })
      .catch(() => undefined);
    return () => {
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.then((stream) => stream?.getTracks().forEach((t) => t.stop()));
    };
  }, [ensureStream]);

  const start = useCallback(async () => {
    const stream = await ensureStream();
    if (!stream) return false;
    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    chunksRef.current = [];
    recorder.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
    recorder.start(100);
    recorderRef.current = recorder;
    return true;
  }, [ensureStream]);

  const stop = useCallback(
    () =>
      new Promise<Blob | null>((resolve) => {
        const recorder = recorderRef.current;
        recorderRef.current = null;
        if (!recorder || recorder.state === "inactive") return resolve(null);
        recorder.onstop = () => resolve(new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" }));
        recorder.stop();
      }),
    [],
  );

  return { mic, level, start, stop };
}

async function submit(blob: Blob): Promise<string> {
  const contentType = blob.type.split(";")[0] || "audio/webm";
  const res = await fetch("/api/jobs", { method: "POST", headers: { "content-type": contentType }, body: blob });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "The request was not accepted.");
  return (await res.json()).id;
}

function stepsFor(job: JobView | null): AgentStep[] {
  const claimed = job?.status === "claimed";
  return [
    { id: "sent", label: "Request sent", status: "done" },
    { id: "photo", label: claimed ? "Camera took a photo" : "Waiting for the camera", status: claimed ? "done" : "running" },
    { id: "look", label: "Looking for it", status: claimed ? "running" : "pending" },
  ];
}

function slipFor(job: JobView): { stamp: string; lines: SlipLine[] } {
  const lines: SlipLine[] = [];
  if (job.transcript) lines.push({ text: `Asked: “${job.transcript}”`, quiet: true });
  const name = job.target ?? "that";
  if (job.found && job.match) {
    lines.push({ text: `Found: ${name}`, strong: true });
    const place = placeWords(job.match.zone);
    lines.push({ text: place ? `On ${place}` : "Place not marked" });
    lines.push({ text: `${percent(job.match.confidence)} sure`, quiet: true });
  } else if (job.lastSighting) {
    lines.push({ text: `Not in view: ${name}`, strong: true });
    const place = placeWords(job.lastSighting.zone);
    lines.push({ text: `Last seen ${clockTime(job.lastSighting.seenAt)}${place ? `, ${place}` : ""}` });
  } else {
    lines.push({ text: `Never seen: ${name}`, strong: true });
  }
  return { stamp: clockTime(job.createdAt), lines };
}

export function AskPanel() {
  const { mic, level, start, stop } = useRecorder();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [blocked, setBlocked] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const holdRef = useRef<Promise<boolean> | null>(null);

  // Poll the job until it is answered, failed, or stale.
  const jobId = phase.kind === "waiting" ? phase.jobId : null;
  useEffect(() => {
    if (!jobId) return;
    let alive = true;
    let timer = 0;
    const poll = async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const job: JobView = await res.json();
        if (!alive) return;
        if (job.status === "done") return setPhase({ kind: "answered", job, at: Date.now() });
        if (job.status === "failed") return setPhase({ kind: "failed", message: job.error ?? "The desktop could not finish." });
        if (job.stale && job.status === "pending") return setPhase({ kind: "offline" });
        if (job.stale) return setPhase({ kind: "failed", message: "The desktop did not answer in time." });
        setPhase({ kind: "waiting", job, jobId });
      } catch {
        if (!alive) return;
      }
      timer = window.setTimeout(poll, POLL_MS);
    };
    timer = window.setTimeout(poll, POLL_MS);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [jobId]);

  const onHoldStart = () => {
    setBlocked(false);
    setPhase({ kind: "recording" });
    holdRef.current = start();
  };

  const onHoldEnd = async (seconds: number) => {
    const started = await holdRef.current;
    holdRef.current = null;
    const blob = await stop();
    if (!started) return setPhase({ kind: "idle" });
    if (seconds < MIN_HOLD_S) {
      return setPhase({ kind: "idle", hint: "Hold the button down while you speak, then let go." });
    }
    if (!blob || blob.size === 0) {
      // A long hold that caught nothing: the microphone was still opening (the first time, the
      // browser asks for permission while the button is held).
      return setPhase({ kind: "idle", hint: "The microphone was still starting. Hold the button and ask again." });
    }
    setPhase({ kind: "sending" });
    try {
      const id = await submit(blob);
      setPhase({ kind: "waiting", job: null, jobId: id });
    } catch (error) {
      setPhase({ kind: "failed", message: (error as Error).message });
    }
  };

  const micBlocked = mic === "denied" || mic === "unavailable";
  const working = phase.kind === "sending" || phase.kind === "waiting";
  const answer = phase.kind === "answered" ? phase.job : null;
  const slip = answer ? slipFor(answer) : null;

  return (
    <div className="grid gap-4 md:grid-cols-12">
      <section aria-labelledby="ask-title" className="bg-panel p-5 md:col-span-9">
        <h2 className="font-semibold text-[15px]" id="ask-title">
          Ask where something is
        </h2>

        <div className="mt-4 grid gap-6 sm:grid-cols-[minmax(0,240px)_minmax(0,1fr)]">
          <div className="flex flex-col items-center">
            <AI_Voice
              caption={working ? "Working on your last question" : "Hold to ask"}
              disabled={micBlocked || working}
              level={level}
              onHoldEnd={onHoldEnd}
              onHoldStart={onHoldStart}
              recording={phase.kind === "recording"}
            />
            {mic === "denied" && (
              <p className="mt-3 text-center text-copper text-sm" role="alert">
                The microphone is blocked. Allow it in this site&apos;s settings (the icon left of the address), then
                reload. <Link className="underline underline-offset-4" href="/items">Items</Link> still work without it.
              </p>
            )}
            {mic === "unavailable" && (
              <p className="mt-3 text-center text-copper text-sm" role="alert">
                No microphone is available in this browser. You can still browse{" "}
                <Link className="underline underline-offset-4" href="/items">Items</Link>.
              </p>
            )}
            {phase.kind === "idle" && phase.hint && (
              <p className="mt-3 text-center text-sm" role="status">
                {phase.hint}
              </p>
            )}
          </div>

          <div aria-live="polite" className="min-w-0" data-phase={phase.kind}>
            {(phase.kind === "idle" || phase.kind === "recording") && (
              <p className="max-w-[46ch] text-[17px] text-ink-muted">
                Say what you are looking for, like “where are my keys?”. The camera takes a photo and the answer is
                read back to you.
              </p>
            )}
            {working && (
              <div>
                <CogTrain className="mb-3" />
                <AILoadingState
                  className="justify-start"
                  collapseWhenDone={false}
                  steps={phase.kind === "waiting" ? stepsFor(phase.job) : [{ id: "sent", label: "Sending your question", status: "running" }]}
                />
              </div>
            )}
            {phase.kind === "offline" && (
              <div role="alert">
                <p className="font-semibold text-[17px]">The camera has not picked this up.</p>
                <p className="mt-1 text-ink-muted">It may be offline or switched off. Check it, then ask again.</p>
              </div>
            )}
            {phase.kind === "failed" && (
              <div role="alert">
                <p className="font-semibold text-[17px] text-copper">That request failed.</p>
                <p className="mt-1 text-ink-muted">{phase.message} Hold the button to try again.</p>
              </div>
            )}
            {answer && (
              <div data-testid="answer">
                {answer.transcript && <p className="text-ink-muted text-sm">You asked: “{answer.transcript}”</p>}
                <SyncedTranscript
                  className="mt-2"
                  key={answer.id}
                  onAutoplayBlocked={() => setBlocked(true)}
                  onPlayingChange={setSpeaking}
                  src={answer.replyAudioUrl}
                  text={answer.replyText ?? ""}
                  timings={answer.replyTimings}
                />
                {blocked && <p className="mt-2 text-ink-muted text-sm">Press play to hear the answer.</p>}
              </div>
            )}
          </div>
        </div>

        {phase.kind === "answered" && <AnswerPhoto job={phase.job} now={phase.at} />}
      </section>

      {/* The right column: the answer slip once there is one, and the narrator standing in
          the section's bottom-right corner. In the page flow, so he never covers content. */}
      <div className="flex flex-col gap-4 md:col-span-3">
        {slip && answer && (
          <aside aria-label="Answer slip">
            <ReceiptPrinter autoPrint className="h-[22rem] w-full" key={answer.id} label="Answer slip" lines={slip.lines} stamp={slip.stamp} />
          </aside>
        )}
        <Narrator className="mt-auto ml-auto w-40 md:w-full md:max-w-[220px]" speaking={speaking} />
      </div>
    </div>
  );
}

function AnswerPhoto({ job, now }: { job: JobView; now: number }) {
  const name = job.target ?? "item";
  if (job.found && job.match) {
    const m = job.match;
    const place = placeWords(m.zone);
    return (
      <figure className="mt-6 grid gap-4 sm:grid-cols-[minmax(0,1fr)_200px]" data-testid="found">
        <SnapshotFrame
          alt={`Camera photo with the ${name} marked`}
          height={m.snapshot.height}
          lens={{ box: m.box, label: name, confidence: m.confidence }}
          priority
          src={m.snapshot.url}
          width={m.snapshot.width}
        />
        <figcaption className="text-[15px]">
          <span className="block font-semibold capitalize">{name}</span>
          <span className="block">{place ? `On ${place}` : "Place not marked"}</span>
          <span className="figures block text-ink-muted">{percent(m.confidence)} sure</span>
          <span className="figures block text-ink-muted">Photo at {clockTime(m.seenAt)}</span>
        </figcaption>
      </figure>
    );
  }
  if (job.photo) {
    const s = job.lastSighting;
    return (
      <figure className="mt-6 grid gap-4 sm:grid-cols-[minmax(0,1fr)_200px]" data-testid="not-found">
        <SnapshotFrame
          alt={`Camera photo taken at ${clockTime(job.photo.seenAt)}; the ${name} is not in it`}
          height={job.photo.height}
          priority
          src={job.photo.url}
          width={job.photo.width}
        />
        <figcaption className="text-[15px]">
          <span className="block font-semibold">Not in view right now</span>
          <span className="figures block text-ink-muted">Photo at {clockTime(job.photo.seenAt)}</span>
          {s && <span className="block">Last seen {relativeTime(s.seenAt, now)}</span>}
          {job.itemId && (
            <Link className="mt-2 block underline underline-offset-4" href={`/items/${job.itemId}`}>
              See where the {name} {name.endsWith("s") ? "have" : "has"} been
            </Link>
          )}
        </figcaption>
      </figure>
    );
  }
  if (job.lastSighting) {
    const s = job.lastSighting;
    const place = placeWords(s.zone);
    return (
      <figure className="mt-6 grid gap-4 sm:grid-cols-[minmax(0,1fr)_200px]" data-testid="not-found">
        <SnapshotFrame
          alt={`Last photo with the ${name}, ${relativeTime(s.seenAt, now)}`}
          height={s.snapshot.height}
          lens={{ box: s.box, label: name }}
          src={s.snapshot.url}
          width={s.snapshot.width}
        />
        <figcaption className="text-[15px]">
          <span className="block font-semibold">Not in view right now</span>
          <span className="block">
            Last seen {relativeTime(s.seenAt, now)}
            {place ? ` on ${place}` : ""}
          </span>
          {job.itemId && (
            <Link className="mt-2 block underline underline-offset-4" href={`/items/${job.itemId}`}>
              See where the {name} {name.endsWith("s") ? "have" : "has"} been
            </Link>
          )}
        </figcaption>
      </figure>
    );
  }
  return (
    <p className="mt-6 text-[15px]" data-testid="never-seen">
      The camera has not seen the {name} yet. Put it somewhere in view and it will be remembered.
    </p>
  );
}
