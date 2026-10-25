"use client";

import { Camera, ChevronDown, ChevronUp, Keyboard, Mic } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import AI_Prompt, { type PromptMode } from "@/components/kokonutui/ai-prompt";
import type { JobView } from "@/lib/data/types";
import { GREETINGS, GREETING_KEY, nextGreetingIndex } from "@/lib/greetings";
import { useDeviceStatus } from "./device-status";
import { HoldToTalk, useCameraJobs, useElapsed } from "./ask-inputs";
import { Stage } from "./stage";

/** The three ways to ask, picked from the menu inside the prompt. */
export type AskMode = "speak" | "type" | "camera";
const MODES: PromptMode[] = [
  { id: "speak", name: "Speak here", description: "Hold the button and talk to this computer", icon: <Mic /> },
  { id: "type", name: "Type it", description: "Write the question", icon: <Keyboard /> },
  { id: "camera", name: "Camera button", description: "Press the camera's button and use its mic", icon: <Camera /> },
];

export const POLL_MS = 400;
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

  /** Tries each recording format on a stream. Some browsers accept a MIME type in isTypeSupported but fail to start with it. */
  const tryRecord = useCallback((stream: MediaStream) => {
    for (const mimeType of [pickMimeType(), ""]) {
      try {
        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        chunksRef.current = [];
        recorder.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
        recorder.start(100);
        recorderRef.current = recorder;
        return true;
      } catch (error) {
        console.error("[mic]", mimeType || "default type", error);
      }
    }
    return false;
  }, []);

  const start = useCallback(async () => {
    // A stream whose tracks ended (device switched, another app took the mic) cannot record; open a fresh one.
    for (let attempt = 0; attempt < 2; attempt++) {
      const stream = await ensureStream();
      if (!stream) return false;
      if (stream.getAudioTracks().some((t) => t.readyState === "live") && tryRecord(stream)) return true;
      streamRef.current = null;
      stream.getTracks().forEach((t) => t.stop());
    }
    return false;
  }, [ensureStream, tryRecord]);

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

// One greeting per page load: picked the first time it is read in the browser, then kept.
let greetingIndex: number | null = null;
function pickGreeting(): number {
  if (greetingIndex !== null) return greetingIndex;
  try {
    greetingIndex = nextGreetingIndex(localStorage.getItem(GREETING_KEY));
    localStorage.setItem(GREETING_KEY, String(greetingIndex));
  } catch {
    // Storage blocked (a private window, say): any of the lines will do.
    greetingIndex = Math.floor(Math.random() * GREETINGS.length);
  }
  return greetingIndex;
}

/** The narrator's opening line, from the pool in lib/greetings.ts, a different one each reload. */
function useGreeting(): string | null {
  const index = useSyncExternalStore(noSubscribe, pickGreeting, () => -1);
  return index < 0 ? null : GREETINGS[index];
}

/**
 * The Ask page, starting fresh every time it is shown. Next keeps pages alive in the
 * background when you navigate away, so without this, coming back from Items would show
 * the last answer (and its reply could keep playing). Leaving bumps the key, so the
 * session underneath is thrown away and rebuilt at its default.
 */
export function AskPanel() {
  const [visit, setVisit] = useState(0);
  // Cleanup runs when the page is hidden (navigated away from) or unmounted.
  useEffect(() => () => setVisit((v) => v + 1), []);
  return <AskSession key={visit} />;
}

function AskSession() {
  const greeting = useGreeting();
  const { mic, start, stop } = useRecorder();
  const status = useDeviceStatus();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [mode, setMode] = useState<AskMode>("type");
  // The prompt floats over the stage; minimising it clears the narrator's dialogue.
  const [minimized, setMinimized] = useState(false);
  const holdRef = useRef<Promise<boolean> | null>(null);
  const recording = phase.kind === "recording";
  const elapsed = useElapsed(recording);

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

  // The answer shows as soon as its text is ready; fetch again until the spoken reply (audio and word times) is too.
  useEffect(() => {
    if (phase.kind !== "answered" || !phase.job.replyPending) return;
    const id = phase.job.id;
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/jobs/${id}`, { cache: "no-store" });
        if (!res.ok) return;
        const job: JobView = await res.json();
        setPhase((p) => (p.kind === "answered" && p.job.id === id ? { ...p, job } : p));
      } catch {
        // the next change of phase tries again
      }
    }, POLL_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  const onHoldStart = () => {
    setPhase({ kind: "recording" });
    holdRef.current = start();
  };

  const onHoldEnd = async (seconds: number) => {
    const started = await holdRef.current;
    holdRef.current = null;
    const blob = await stop();
    if (!started) return setPhase({ kind: "idle", hint: "The microphone could not start. Hold the button and try again." });
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

  const askText = async (text: string) => {
    setPhase({ kind: "sending" });
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "The question was not accepted.");
      setPhase({ kind: "waiting", job: null, jobId: body.id });
    } catch (error) {
      setPhase({ kind: "failed", message: (error as Error).message });
    }
  };

  const onCameraJob = useCallback((id: string) => {
    setPhase({ kind: "waiting", job: null, jobId: id });
  }, []);

  const cameraOffline = status?.some((d) => d.device === "pi" && !d.online) ?? false;

  const correct = async (found: boolean) => {
    if (phase.kind !== "answered") return;
    const res = await fetch(`/api/jobs/${phase.job.id}/correct`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ found }),
    });
    if (!res.ok) throw new Error(String(res.status));
    setPhase({ kind: "answered", job: await res.json(), at: Date.now() });
  };
  const micBlocked = mic === "denied" || mic === "unavailable";
  const working = phase.kind === "sending" || phase.kind === "waiting";
  const answer = phase.kind === "answered" ? phase.job : null;
  useCameraJobs(mode === "camera" && !working, onCameraJob);

  const changeMode = (next: string) => {
    setMode(next as AskMode);
    if (phase.kind === "idle" && phase.hint) setPhase({ kind: "idle" });
  };

  let body = null;
  let action = null;
  if (mode === "speak") {
    body = (
      <p className={recording ? "text-ink" : "text-ink-muted"}>
        {recording
          ? `Listening… ${Math.floor(elapsed)}s. Let go to send.`
          : working
            ? "Working on your last question…"
            : "Hold the button and ask, like “where are my keys?”"}
      </p>
    );
    action = <HoldToTalk disabled={micBlocked || working} onHoldEnd={onHoldEnd} onHoldStart={onHoldStart} recording={recording} />;
  } else if (mode === "camera") {
    body = (
      <p className="text-ink-muted" data-testid="camera-button">
        {working
          ? "Working on the camera's question…"
          : cameraOffline
            ? "The camera is offline, so its button cannot be heard."
            : "Press the button on the camera and ask out loud. Listening for the camera button…"}
      </p>
    );
    action = null;
  }

  const line =
    phase.kind === "recording"
      ? "I am listening…"
      : phase.kind === "sending"
        ? "Sending your question…"
        : phase.kind === "waiting"
          ? phase.job?.status === "claimed"
            ? "The camera has a photo. Looking for it…"
            : "Waiting for the camera to take a photo…"
          : phase.kind === "offline"
            ? "The camera has not picked this up. It may be offline or switched off. Check it, then ask again."
            : phase.kind === "failed"
              ? `That request failed. ${phase.message} Ask again to try once more.`
              : (phase.kind === "idle" && phase.hint) || greeting || "";

  return (
    <div className="flex min-h-[calc(100dvh-120px)] flex-col gap-4">
      <div className="flex flex-1 items-center justify-center" data-mic={mic} data-phase={phase.kind}>
        <Stage
          answer={answer}
          answeredAt={phase.kind === "answered" ? phase.at : 0}
          aside={answer && <CorrectPrompt job={answer} key={`${answer.id}:${answer.corrected}`} onCorrect={correct} />}
          key={answer ? `${answer.id}:${answer.corrected}` : "idle"}
          line={line}
          working={working}
        />
      </div>
      <div className="sticky bottom-0 mx-auto flex w-full max-w-[560px] flex-col items-end pb-3">
      <button
        aria-expanded={!minimized}
        className="mb-1 flex items-center gap-1.5 bg-ink/85 px-3 py-1 text-paper text-sm hover:bg-ink focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brass"
        data-testid="prompt-toggle"
        onClick={() => setMinimized((m) => !m)}
        type="button"
      >
        {minimized ? <ChevronUp aria-hidden className="size-4" /> : <ChevronDown aria-hidden className="size-4" />}
        {minimized ? "Ask a question" : "Minimise"}
      </button>
      <div className={minimized ? "hidden" : "w-full"}>
      <AI_Prompt
        action={action}
        body={body}
        busy={working}
        mode={mode}
        modes={MODES}
        onModeChange={changeMode}
        onSubmit={askText}
        textMode="type"
      />
      </div>

      {mode === "speak" && mic === "denied" && (
        <p className="text-copper text-sm" role="alert">
          The microphone is blocked. Allow it in this site&apos;s settings (the icon left of the address), then reload, or
          switch to Type it. <Link className="underline underline-offset-4" href="/items">Items</Link> still work without it.
        </p>
      )}
      {mode === "speak" && mic === "unavailable" && (
        <p className="text-copper text-sm" role="alert">
          No microphone is available in this browser. Switch to Type it, or browse{" "}
          <Link className="underline underline-offset-4" href="/items">Items</Link>.
        </p>
      )}
      </div>

    </div>
  );
}

/** Optional: the user disagrees with the camera's verdict. */
function CorrectPrompt({ job, onCorrect }: { job: JobView; onCorrect: (found: boolean) => Promise<void> }) {
  const [state, setState] = useState<"idle" | "busy" | "failed">("idle");
  if (job.found === null) return null;
  const flip = !job.found;
  const name = job.target ?? "item";
  const is = name.endsWith("s") ? "are" : "is"; // "the keys are", "the wallet is"
  return (
    <p className="mt-3 text-[15px]" data-testid="correction">
      <span className="text-ink-muted">{job.corrected ? "Corrected by you. " : "Not right? "}</span>
      <button
        className="underline underline-offset-4 hover:text-copper disabled:opacity-50"
        disabled={state === "busy"}
        onClick={async () => {
          setState("busy");
          try {
            await onCorrect(flip);
          } catch {
            setState("failed");
          }
        }}
        type="button"
      >
        {flip ? `The ${name} ${is} in the photo` : `The ${name} ${is} not in the photo`}
      </button>
      {state === "failed" && <span className="ml-2 text-copper">That could not be saved.</span>}
    </p>
  );
}
