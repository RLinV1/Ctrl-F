import { connection } from "next/server";
import { S3Store } from "./s3-store";
import type { Store } from "./store";

/** Route bundles each carry their own copy of this module, so the one store (and its in-flight narrations) lives on globalThis. */
const g = globalThis as { __ctrlfStore?: Store };

/** Awaiting the connection first keeps pages that read the bucket out of prerendering. */
export async function store(): Promise<Store> {
  await connection();
  return (g.__ctrlfStore ??= new S3Store());
}

/** "Now" for server-rendered pages; reading the clock opts the page out of prerendering. */
export async function requestTime(): Promise<number> {
  await connection();
  return Date.now();
}
