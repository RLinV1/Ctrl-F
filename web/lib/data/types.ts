/** Shapes the API returns and the screens render. */

export type Box = { x: number; y: number; w: number; h: number };
export type Snapshot = { id: string; url: string; width: number; height: number };
export type Sighting = {
  id: string;
  seenAt: string;
  label: string;
  confidence: number | null;
  locationDescription?: string | null;
  box: Box;
  zone: string | null;
  snapshot: Snapshot;
};
export type Item = { id: string; name: string; lostCount: number; lastSeen: Sighting | null };
export type WordTime = { word: string; start: number; end: number };
/** Where a question came from: this page, or the camera's own button and mic. */
export type JobSource = "web" | "device";

export type JobView = {
  id: string;
  status: "pending" | "claimed" | "done" | "failed";
  /** Old enough that the Pi or the desktop is probably not coming. */
  stale: boolean;
  createdAt: string;
  transcript: string | null;
  target: string | null;
  itemId: string | null;
  found: boolean | null;
  /** The user overrode the detector's verdict. */
  corrected: boolean;
  replyText: string | null;
  replyAudioUrl: string | null;
  /** The text is ready but the spoken reply is still being made: ask again shortly for the audio and word times. */
  replyPending: boolean;
  replyTimings: WordTime[] | null;
  /** The photo the camera took for this job, as the processing server marked it. */
  photo: (Snapshot & { seenAt: string }) | null;
  match: Sighting | null;
  lastSighting: Sighting | null;
  historyStatus?: "available" | "never_seen" | "unavailable" | "not_needed";
  error: string | null;
};

export type DeviceStatus = { device: "pi" | "desktop"; lastSeenAt: string | null; online: boolean };
