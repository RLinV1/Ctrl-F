import { Suspense } from "react";
import { Mark } from "@/components/ctrlf/mark";
import { safeNext } from "@/lib/auth/session";

export const metadata = { title: "Sign in · Ctrl-F" };

export default function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-paper px-4">
      <div className="w-full max-w-[360px] border border-rule bg-sheet p-6">
        <div className="flex items-center gap-2.5">
          <Mark className="size-8" />
          <span className="font-heading font-bold text-[22px] leading-none">Ctrl-F</span>
        </div>
        <h1 className="mt-6 font-heading font-bold text-[28px] leading-tight">Sign in</h1>
        <p className="mt-1 text-ink-muted">This household&apos;s photos and recordings are private.</p>
        <Suspense fallback={<p className="mt-6 text-ink-muted">Loading…</p>}>
          <Form searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function Form({ searchParams }: { searchParams: PageProps<"/sign-in">["searchParams"] }) {
  const params = await searchParams;
  const next = safeNext(typeof params.next === "string" ? params.next : "/");
  return <SignInForm error={params.error === "1"} next={next} />;
}

function SignInForm({ next, error }: { next: string; error?: boolean }) {
  return (
    <form action="/api/session" className="mt-6" method="post">
      <input name="next" type="hidden" value={next} />
      <label className="block font-semibold text-sm" htmlFor="password">
        Password
      </label>
      <input
        aria-describedby={error ? "password-error" : undefined}
        aria-invalid={error || undefined}
        autoComplete="current-password"
        className="mt-1.5 h-10 w-full border border-rule bg-card-row px-3 text-[15px] outline-none focus-visible:border-brass-ink"
        id="password"
        name="password"
        required
        type="password"
      />
      {error && (
        <p className="mt-2 text-copper text-sm" id="password-error" role="alert">
          That password is wrong.
        </p>
      )}
      <button className="mt-4 h-10 w-full bg-brass font-semibold text-ink transition-colors hover:bg-brass/85" type="submit">
        Sign in
      </button>
    </form>
  );
}
