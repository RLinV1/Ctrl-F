import { connection } from "next/server";
import { S3Store } from "./s3-store";
import type { Store } from "./store";

/** Route bundles each carry their own copy of this module, so the one store (and its in-flight narrations) lives on globalThis. */
const g = globalThis as { __ctrlfStore?: Store };

/** Awaiting the connection first keeps pages that read the bucket out of prerendering. */
export async function store(): Promise<Store> {
  await connection();
  // In dev, hot reload swaps this class but keeps the old instance. One missing a method the new code calls would fail
  // every page that uses it and make Next.js reload in a loop, so replace it. (Comparing method names, not classes:
  // each route bundle has its own copy of the class.)
  const methods = Object.getOwnPropertyNames(S3Store.prototype);
  if (!g.__ctrlfStore || methods.some((m) => typeof (g.__ctrlfStore as unknown as Record<string, unknown>)[m] !== "function")) {
    g.__ctrlfStore = new S3Store();
  }
  return g.__ctrlfStore;
}

/** "Now" for server-rendered pages; reading the clock opts the page out of prerendering. */
export async function requestTime(): Promise<number> {
  await connection();
  return Date.now();
}
