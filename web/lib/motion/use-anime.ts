"use client";

import { createScope, type Scope } from "animejs";
import { type DependencyList, type RefObject, useEffect } from "react";

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Runs anime.js work inside a scope rooted at `root`, and reverts every animation
 * the scope made when the component unmounts or `deps` change. `setup` is told
 * whether reduced motion is preferred, and must then put elements straight into
 * their end state instead of animating.
 */
export function useAnime(
  root: RefObject<Element | null>,
  setup: (ctx: { reduced: boolean; scope: Scope }) => void,
  deps: DependencyList,
) {
  useEffect(() => {
    const reduced = prefersReducedMotion();
    const scope = createScope({ root: root as RefObject<HTMLElement> }).add((self) => {
      setup({ reduced, scope: self as Scope });
    });
    return () => {
      scope.revert();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
