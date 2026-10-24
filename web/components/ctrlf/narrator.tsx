"use client";

import { animate } from "animejs";
import { createContext, type ReactNode, useContext, useMemo, useRef, useState } from "react";
import { useAnime } from "@/lib/motion/use-anime";
import { cn } from "@/lib/utils";

/*
 * The narrator: the steampunk detective whose voice (ElevenLabs) reads every answer.
 * He sits in the frame's corner on every screen and comes alive while a reply plays.
 * Whether he is speaking is shared through context, so the Ask screen's audio
 * player can tell the shell.
 */

type NarratorState = { speaking: boolean; setSpeaking: (speaking: boolean) => void };

const NarratorContext = createContext<NarratorState>({ speaking: false, setSpeaking: () => undefined });

export function NarratorProvider({ children }: { children: ReactNode }) {
  const [speaking, setSpeaking] = useState(false);
  const value = useMemo(() => ({ speaking, setSpeaking }), [speaking]);
  return <NarratorContext.Provider value={value}>{children}</NarratorContext.Provider>;
}

export const useNarrator = () => useContext(NarratorContext);

export function Narrator({ className }: { className?: string }) {
  const { speaking } = useNarrator();
  const root = useRef<HTMLElement>(null);
  useAnime(
    root,
    ({ reduced }) => {
      if (!speaking || reduced) return;
      // A small nod while he talks; the scope reverts it the moment he stops.
      animate("[data-narrator]", {
        translateY: [0, -3, 0],
        rotate: [0, -1.2, 0],
        duration: 520,
        ease: "inOutSine",
        loop: true,
      });
    },
    [speaking],
  );

  return (
    <figure className={cn("relative", className)} data-speaking={speaking || undefined} ref={root}>
      {/* eslint-disable-next-line @next/next/no-img-element -- a transparent PNG; the optimiser is off locally */}
      <img
        alt="The narrator, a detective in a deerstalker with brass goggles and a pipe"
        className="block h-auto w-full origin-bottom"
        data-narrator
        decoding="async"
        height={400}
        src="/narrator.png"
        width={400}
      />
      <figcaption aria-live="polite" className="mt-1 text-ink-muted text-sm">
        {speaking ? (
          <span className="font-semibold text-ink">Speaking…</span>
        ) : (
          "Your narrator reads every answer aloud."
        )}
      </figcaption>
    </figure>
  );
}
