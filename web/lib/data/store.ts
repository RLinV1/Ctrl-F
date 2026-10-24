import type { DeviceStatus, Item, JobView, Sighting } from "./types";

export const SIGHTINGS_DEFAULT_LIMIT = 20;
export const SIGHTINGS_MAX_LIMIT = 100;
export const HISTORY_PAGE_SIZE = 12;

/** What the route handlers and pages need from storage. The S3 store is the only implementation. */
export interface Store {
  createUploadSlot(contentType: string): Promise<{ audioKey: string; uploadUrl: string; expiresAt: string }>;
  storeAudio(key: string, body: ArrayBuffer, contentType: string): Promise<void>;
  audioExists(key: string): Promise<boolean>;
  /** Transcribes the recording and picks the items asked for. Never throws on a bad transcript: it becomes a no-target job. */
  createJob(audioKey: string): Promise<JobView>;
  /** Oldest pending job for the Pi, now claimed, with the items to look for. */
  claimNextJob(): Promise<{ id: string; targets: string[] } | null>;
  touchDevice(device: "pi"): Promise<void>;
  /** Also narrates the job once the desktop has written its result. */
  getJob(id: string): Promise<JobView | null>;
  listItems(): Promise<Item[]>;
  getItem(id: string): Promise<Item | null>;
  itemSightings(id: string, opts: { limit: number; before?: string }): Promise<Sighting[] | null>;
  deviceStatus(): Promise<DeviceStatus[]>;
}
