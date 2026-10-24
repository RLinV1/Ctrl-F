import { Suspense } from "react";
import { SnapshotFrame } from "@/components/ctrlf/snapshot-frame";
import { requestTime, store } from "@/lib/data";
import type { JobView } from "@/lib/data/types";
import { exactTime, percent, relativeTime } from "@/lib/format";

export const metadata = { title: "Results · Ctrl-F" };

const LIMIT = 50;

export default function ResultsPage() {
  return (
    <div className="mx-auto max-w-[1100px] px-4 pt-10 pb-16 md:px-8 md:pt-[72px]">
      <h1 className="font-heading font-bold text-[26px] leading-[1.1] tracking-[-0.01em] md:text-[32px]">
        Every question and its answer
      </h1>
      <Suspense fallback={<p className="mt-6 text-ink-muted">Loading results…</p>}>
        <ResultList />
      </Suspense>
    </div>
  );
}

function outcome(job: JobView): string {
  if (job.status === "done") {
    if (!job.target) return "No item named";
    if (job.found === null) return "Cannot seek";
    return `${job.found ? "Found" : "Not in view"}${job.corrected ? " (corrected)" : ""}`;
  }
  if (job.stale) return "No answer";
  return job.status === "claimed" ? "Looking" : "Waiting for the camera";
}

async function ResultList() {
  const jobs = await (await store()).listJobs(LIMIT);
  const now = await requestTime();
  if (jobs.length === 0) {
    return (
      <section className="mt-12 bg-panel p-5">
        <h2 className="font-semibold text-[15px]">No questions yet</h2>
        <p className="mt-1 max-w-[60ch] text-ink-muted">Ask something on the Ask page and the answer is kept here.</p>
      </section>
    );
  }
  return (
    <>
      <p className="mt-3 max-w-[70ch] text-[17px] text-ink-muted">
        {jobs.length === LIMIT ? `The latest ${LIMIT} questions` : `${jobs.length} questions`}, newest first.
      </p>
      <ul className="mt-12 space-y-4">
        {jobs.map((job) => (
          <li className="bg-panel p-5" data-job={job.id} key={job.id}>
            <div className="grid gap-4 sm:grid-cols-[minmax(0,200px)_minmax(0,1fr)]">
              <div>
                {job.match ? (
                  <SnapshotFrame
                    alt={`${job.target} found`}
                    height={job.match.snapshot.height}
                    lens={{ box: job.match.box, label: job.target ?? "item" }}
                    src={job.match.snapshot.url}
                    width={job.match.snapshot.width}
                  />
                ) : job.photo ? (
                  <SnapshotFrame alt={`Camera photo for ${job.target ?? "the question"}`} height={job.photo.height} src={job.photo.url} width={job.photo.width} />
                ) : (
                  <div className="flex aspect-video items-center justify-center bg-card-row text-ink-muted text-xs">
                    No photo
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-ink-muted text-sm">
                  {exactTime(job.createdAt)}, {relativeTime(job.createdAt, now)}
                </p>
                <p className="mt-1 font-semibold text-[17px]">
                  {outcome(job)}
                  {job.target && <span className="first-letter:uppercase">: {job.target}</span>}
                  {job.match && <span className="figures font-normal text-ink-muted text-sm"> · {percent(job.match.confidence)} sure</span>}
                </p>
                {job.transcript && <p className="mt-1 text-ink-muted text-sm">Asked: “{job.transcript}”</p>}
                {job.replyText && <p className="mt-2">{job.replyText}</p>}
                {job.replyAudioUrl && (
                  // biome-ignore lint/a11y/useMediaCaption: the reply text is shown above
                  <audio className="mt-3 w-full max-w-[360px]" controls preload="none" src={job.replyAudioUrl} />
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
