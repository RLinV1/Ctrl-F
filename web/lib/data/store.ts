import type { DeviceStatus, Item, JobView, Sighting } from "./types";

export const SIGHTINGS_DEFAULT_LIMIT = 20;
export const SIGHTINGS_MAX_LIMIT = 100;
export const HISTORY_PAGE_SIZE = 12;

/** What the route handlers and pages need from storage. The S3 store is the only implementation. */
export interface Store {
  /** Transcribes the recording and picks the items asked for. Never throws on a bad transcript: it becomes a no-target job. */
  createJob(audio: Uint8Array, contentType: string): Promise<JobView>;
  /** The spoken reply for a job, if this server still holds it. */
  replyAudio(id: string): Promise<Buffer | null>;
  /** Also narrates the job once the desktop has written its result. */
  getJob(id: string): Promise<JobView | null>;
  /** The user says the item is (or is not) in the photo after all: re-words the answer. Null when the job is unknown, "conflict" when it has no verdict to correct yet. */
  correctJob(id: string, found: boolean): Promise<JobView | null | "conflict">;
  /** Newest first. Reads the records as they are: it does not narrate jobs that are still waiting. */
  listJobs(limit: number): Promise<JobView[]>;
  listItems(): Promise<Item[]>;
  getItem(id: string): Promise<Item | null>;
  itemSightings(id: string, opts: { limit: number; before?: string }): Promise<Sighting[] | null>;
  deviceStatus(): Promise<DeviceStatus[]>;
}
