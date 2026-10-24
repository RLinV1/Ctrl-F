/** The narrator's opening lines on the Ask page. One is shown per page load, in turn. Edit freely. */
export const GREETINGS = [
  "Good day, old chap. Tell me what has gone astray, and I shall set the camera upon it.",
  "Ah, a new case! Name the missing article, and my lens shall find it.",
  "The gears are turning and the camera is ready. What have you misplaced this time?",
] as const;

/** Where the last shown line is remembered, so the next load shows the one after it. */
export const GREETING_KEY = "ctrlf.greeting";

/** The line after `last` (the stored index, or null when nothing is stored yet). */
export function nextGreetingIndex(last: string | null, count: number = GREETINGS.length): number {
  const n = last === null ? -1 : Number(last);
  return Number.isInteger(n) && n >= 0 ? (n + 1) % count : 0;
}
