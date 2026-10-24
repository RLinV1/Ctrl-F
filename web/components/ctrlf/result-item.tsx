"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

/** A result row that removes itself when its photo fails to load (an expired or missing snapshot). */
export function ResultItem({ id, children }: { id: string; children: ReactNode }) {
  const ref = useRef<HTMLLIElement>(null);
  const [broken, setBroken] = useState(false);

  // The error may fire before hydration, so also check images that already finished broken.
  useEffect(() => {
    const imgs = ref.current?.querySelectorAll("img") ?? [];
    if ([...imgs].some((img) => img.complete && img.naturalWidth === 0)) setBroken(true);
  }, []);

  if (broken) return null;
  return (
    <li className="bg-panel p-5" data-job={id} onErrorCapture={() => setBroken(true)} ref={ref}>
      {children}
    </li>
  );
}
