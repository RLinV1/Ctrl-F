/** Shapes the API returns and the screens render. */

export type Box = { x: number; y: number; w: number; h: number };
export type Snapshot = { id: string; url: string; width: number; height: number };
export type Sighting = {
  id: string;
  seenAt: string;
  label: string;
  confidence: number;
  box: Box;
  zone: string | null;
  snapshot: Snapshot;
};
export type Item = { id: string; name: string; lostCount: number; lastSeen: Sighting | null };
export type WordTime = { word: string; start: number; end: number };

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
  replyText: string | null;
  replyAudioUrl: string | null;
  replyTimings: WordTime[] | null;
  /** The photo the camera took for this job, as the processing server marked it. */
  photo: (Snapshot & { seenAt: string }) | null;
  match: Sighting | null;
  lastSighting: Sighting | null;
  error: string | null;
};

export type DeviceStatus = { device: "pi" | "desktop"; lastSeenAt: string | null; online: boolean };
