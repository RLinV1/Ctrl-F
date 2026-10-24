import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/** Single-password sessions. The signing key comes from UI_PASSWORD, so changing it signs everyone out. */

export const SESSION_COOKIE = "ctrlf_session";
export const SESSION_DAYS = 30;

const key = (password: string) => createHash("sha256").update(`ctrlf-session:${password}`).digest();

function sameBytes(a: Buffer, b: Buffer) {
  return a.length === b.length && timingSafeEqual(a, b);
}

export function passwordMatches(given: string, password: string): boolean {
  // Compare digests so the lengths always match and nothing leaks through timing.
  return sameBytes(createHash("sha256").update(given).digest(), createHash("sha256").update(password).digest());
}

export function signSession(password: string, now: number): string {
  const expires = now + SESSION_DAYS * 24 * 60 * 60_000;
  const mac = createHmac("sha256", key(password)).update(String(expires)).digest("base64url");
  return `${expires}.${mac}`;
}

export function verifySession(value: string | undefined, password: string, now: number): boolean {
  if (!value) return false;
  const [expires, mac] = value.split(".");
  if (!expires || !mac || !/^\d+$/.test(expires) || Number(expires) < now) return false;
  const want = createHmac("sha256", key(password)).update(expires).digest();
  return sameBytes(Buffer.from(mac, "base64url"), want);
}

/** Only same-site paths are allowed after sign-in. */
export function safeNext(next: string | null | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}
