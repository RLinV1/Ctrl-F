import { connection } from "next/server";

/**
 * The sign-out control, shown only when a password is set. Reads the environment at
 * request time, so a prerendered page never bakes in the build machine's setting.
 */
export async function SignOut() {
  await connection();
  if (!process.env.UI_PASSWORD) return null;
  return (
    <form action="/api/session" method="post">
      <input name="intent" type="hidden" value="sign-out" />
      <button className="text-ink-muted text-sm underline-offset-4 hover:text-ink hover:underline" type="submit">
        Sign out
      </button>
    </form>
  );
}
