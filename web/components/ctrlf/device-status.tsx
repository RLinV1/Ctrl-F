"use client";

import { useEffect, useState } from "react";
import type { DeviceStatus } from "@/lib/data/types";
import { clockTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Gauge } from "./gauge";

/*
 * Status area. Built from the header pattern of Kokonut's uptime-card (title, one
 * summary line, a row per service) without its day bars: Ctrl-F stores only each
 * device's latest activity. Fetches /api/status once per page load; status is always in words.
 */

const NAMES = { pi: "Camera", desktop: "Desktop" } as const;
const WINDOWS = { pi: 15_000, desktop: 60_000 } as const;

function line(s: DeviceStatus) {
  if (s.online) return "online";
  return s.lastSeenAt ? `offline since ${clockTime(s.lastSeenAt)}` : "not seen yet";
}

/** Device status and the time it was fetched. Fetched once when the page loads; it is not polled. */
export function useDeviceStatusAt() {
  const [state, setState] = useState<{ status: DeviceStatus[]; at: number } | null>(null);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/status", { cache: "no-store" });
        if (res.ok && alive) setState({ status: await res.json(), at: Date.now() });
      } catch {
        // Leave the status empty; it is fetched again on the next page load.
      }
    };
    load();
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

export function useDeviceStatus() {
  return useDeviceStatusAt()?.status ?? null;
}

export function DeviceStatusPanel({ className }: { className?: string }) {
  const fetched = useDeviceStatusAt();
  const status = fetched?.status ?? null;
  const offline = status?.filter((s) => !s.online) ?? [];
  return (
    <section aria-labelledby="status-title" className={cn("text-sm", className)}>
      <h2 className="font-semibold text-ink" id="status-title">
        Status
      </h2>
      <p aria-live="polite" className="mt-0.5 text-ink-muted">
        {status === null
          ? "Checking…"
          : offline.length === 0
            ? "Camera and desktop are working"
            : `${offline.map((s) => NAMES[s.device]).join(" and ")} offline`}
      </p>
      <ul className="mt-3 space-y-2">
        {(status ?? []).map((s) => {
          const age = s.lastSeenAt && fetched ? fetched.at - Date.parse(s.lastSeenAt) : Infinity;
          const fresh = s.online ? Math.max(0.15, 1 - age / WINDOWS[s.device]) : 0;
          return (
            <li className="flex items-center gap-2.5" data-device={s.device} key={s.device}>
              <Gauge label={`${NAMES[s.device]} ${line(s)}`} value={fresh} />
              <span>
                <span className="font-semibold">{NAMES[s.device]}</span>{" "}
                <span className={cn(s.online ? "text-ink-muted" : "text-copper")}>{line(s)}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
