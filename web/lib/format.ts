/** Words for times and figures, shared by server and client so both render the same text. */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function relativeTime(iso: string, now: number): string {
  const diff = Math.max(0, now - Date.parse(iso));
  if (diff < MINUTE) return "just now";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} min ago`;
  if (diff < DAY) {
    const h = Math.floor(diff / HOUR);
    return `${h} h ago`;
  }
  const d = Math.floor(diff / DAY);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

const exactFormat = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
const clockFormat = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });

export const exactTime = (iso: string) => exactFormat.format(new Date(iso));
export const clockTime = (iso: string) => clockFormat.format(new Date(iso));

export const percent = (n: number) => `${Math.round(n * 100)}%`;

export function timesLost(n: number): string {
  if (n === 0) return "never lost";
  return n === 1 ? "lost once" : `lost ${n} times`;
}

/** "the desk", "the side table", or null. */
export function placeWords(zone: string | null): string | null {
  return zone ? `the ${zone}` : null;
}

export function partOfDay(hour: number): string {
  if (hour < 5) return "Good evening";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
