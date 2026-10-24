import { type NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";

/**
 * The password gate. Off when UI_PASSWORD is unset. Screens without a session go to
 * sign-in; API routes answer 401. The Pi's /api/jobs/next is excluded here and checks
 * its own bearer token, so a UI session never works there and the Pi token never
 * works anywhere else.
 */
export function proxy(request: NextRequest) {
  const password = process.env.UI_PASSWORD;
  if (!password) return NextResponse.next();
  if (verifySession(request.cookies.get(SESSION_COOKIE)?.value, password, Date.now())) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "sign in first" }, { status: 401 });
  }
  const url = new URL("/sign-in", request.url);
  url.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sign-in|api/session|api/jobs/next).*)"],
};
