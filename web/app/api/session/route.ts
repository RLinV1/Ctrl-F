import { cookies } from "next/headers";
import { passwordMatches, SESSION_COOKIE, SESSION_DAYS, safeNext, signSession } from "@/lib/auth/session";

/** Sign in (form post with the password) and sign out. */
export async function POST(request: Request) {
  const form = await request.formData();
  const jar = await cookies();
  const to = (path: string) => new Response(null, { status: 303, headers: { location: path } });

  if (form.get("intent") === "sign-out") {
    jar.delete(SESSION_COOKIE);
    return to("/sign-in");
  }

  const password = process.env.UI_PASSWORD;
  const next = safeNext(String(form.get("next") ?? "/"));
  if (!password) return to(next);
  if (!passwordMatches(String(form.get("password") ?? ""), password)) {
    return to(`/sign-in?error=1&next=${encodeURIComponent(next)}`);
  }
  jar.set(SESSION_COOKIE, signSession(password, Date.now()), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && new URL(request.url).protocol === "https:",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
  return to(next);
}
