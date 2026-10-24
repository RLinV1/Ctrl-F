"use client";

import { Camera, Keyboard, Mic } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import AI_Prompt, { type PromptMode } from "@/components/kokonutui/ai-prompt";
import type { Item, JobView } from "@/lib/data/types";
import { partOfDay, placeWords, relativeTime } from "@/lib/format";
import { useDeviceStatus } from "./device-status";
import { HoldToTalk, SimulatePress, useCameraJobs, useElapsed } from "./ask-inputs";
import { Stage } from "./stage";

/** The three ways to ask, picked from the menu inside the prompt. */
export type AskMode = "speak" | "type" | "camera";
const MODES: PromptMode[] = [
  { id: "speak", name: "Speak here", description: "Hold the button and talk to this computer", icon: <Mic /> },
  { id: "type", name: "Type it", description: "Write the question", icon: <Keyboard /> },
  { id: "camera", name: "Camera button", description: "Press the camera's button and use its mic", icon: <Camera /> },
];

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
  const slotRes = await fetch("/api/uploads", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ contentType }),
  });
  if (!slotRes.ok) throw new Error("Could not get an upload slot.");
  const slot: { audioKey: string; uploadUrl: string } = await slotRes.json();
  const put = await fetch(slot.uploadUrl, { method: "PUT", headers: { "content-type": contentType }, body: blob });
  if (!put.ok) throw new Error("The recording did not upload.");
  const jobRes = await fetch("/api/jobs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ audioKey: slot.audioKey }),
  });
  if (!jobRes.ok) throw new Error("The request was not accepted.");
  return (await jobRes.json()).id;
}

/** The narrator's opening line: the time of day and the last thing the camera saw. */
function useGreeting() {
  const [greeting, setGreeting] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/items", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((items: Item[]) => {
        if (!alive) return;
        const now = new Date();
        const newest = items.find((i) => i.lastSeen);
        const fact = newest?.lastSeen
          ? `The ${newest.name} was the last thing seen, ${relativeTime(newest.lastSeen.seenAt, now.getTime())}${
              newest.lastSeen.zone ? ` on ${placeWords(newest.lastSeen.zone)}` : ""
            }.`
          : "Nothing has been seen yet.";
        setGreeting(`${partOfDay(now.getHours())}. ${fact} Where shall I look?`);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return greeting;
}

export function AskPanel() {
  const greeting = useGreeting();
  const { mic, start, stop } = useRecorder();
  const status = useDeviceStatus();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [mode, setMode] = useState<AskMode>("type");
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

  const onHoldStart = () => {
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

  const offline = status?.filter((s) => !s.online) ?? [];
  const cameraOffline = offline.some((d) => d.device === "pi");
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
    action = !working && !cameraOffline ? <SimulatePress /> : null;
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
              : (phase.kind === "idle" && phase.hint) || greeting || "Good day. Ask me where something is, and I shall find it.";

  return (
    <div className="flex min-h-[calc(100dvh-120px)] flex-col gap-4">
      <div className="flex flex-1 items-center justify-center" data-phase={phase.kind}>
        <Stage
          answer={answer}
          answeredAt={phase.kind === "answered" ? phase.at : 0}
          key={answer?.id ?? "idle"}
          line={line}
          working={working}
        />
      </div>
      <div className="sticky bottom-0 mx-auto w-full max-w-[760px] pb-4">
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

      {offline.length > 0 && (
        <p className="text-copper text-sm" data-testid="offline-warning">
          {cameraOffline
            ? "The camera is offline. Your question will wait until it is back."
            : "The desktop is offline. Answers will be delayed until it is back."}
        </p>
      )}
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
