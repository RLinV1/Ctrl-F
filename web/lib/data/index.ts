import { connection } from "next/server";
import { MockStore } from "./mock/store";
import { S3Store } from "./s3-store";
import { dataSource } from "./select";
import type { Store } from "./store";

/** Route bundles each carry their own copy of this module, so the one store (and its in-flight narrations) lives on globalThis. */
const g = globalThis as { __ctrlfStore?: Store };

/** Awaiting the connection first keeps pages that read the bucket out of prerendering. */
export async function store(): Promise<Store> {
  await connection();
  // DATA_SOURCE=mock runs the UI with no bucket, Pi or desktop; MOCK_EMPTY=1 starts it with no items.
  if (!g.__ctrlfStore) {
    // Read as a literal: next.config's `env` only fills in `process.env.NAME` written out in full.
    const mock = dataSource({ DATA_SOURCE: process.env.DATA_SOURCE }) === "mock";
    if (mock) console.log("[store] DATA_SOURCE=mock: seeded in-memory data, no bucket, Pi or desktop");
    g.__ctrlfStore = mock ? new MockStore(Date.now, { empty: process.env.MOCK_EMPTY === "1" }) : new S3Store();
  }
  return g.__ctrlfStore;
}

/** "Now" for server-rendered pages; reading the clock opts the page out of prerendering. */
export async function requestTime(): Promise<number> {
  await connection();
  return Date.now();
}
