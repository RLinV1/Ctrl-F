"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

/** A result row that removes itself when its photo fails to load (an expired or missing snapshot). */
export function ResultItem({ id, children }: { id: string; children: ReactNode }) {
  const ref = useRef<HTMLLIElement>(null);
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    const li = ref.current;
    if (!li) return;
    // An image error does not bubble, but it can be caught on the way down.
    const hide = () => setBroken(true);
    li.addEventListener("error", hide, true);
    // The error may fire before hydration, so also check images that already finished broken.
    if ([...li.querySelectorAll("img")].some((img) => img.complete && img.naturalWidth === 0)) hide();
    return () => li.removeEventListener("error", hide, true);
  }, []);

  if (broken) return null;
  return (
    <li className="bg-panel p-5" data-job={id} ref={ref}>
      {children}
    </li>
  );
}
