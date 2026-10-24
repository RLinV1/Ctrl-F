"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

/** Loads the page's data again without a full reload. */
export function RefreshButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      aria-busy={pending}
      className="border border-rule bg-card-row px-3 py-1.5 font-semibold text-sm hover:bg-panel disabled:opacity-60"
      data-testid="refresh"
      disabled={pending}
      onClick={() => start(() => router.refresh())}
      type="button"
    >
      {pending ? "Refreshing…" : "Refresh"}
    </button>
  );
}
