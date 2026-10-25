import { Pool } from "pg";
import type { Box } from "./types";

/*
 * Read side of the desktop's Postgres (desktop/ctrlf_db/models.py). When DATABASE_URL is set, the Items, History and
 * Results screens read from here instead of being rebuilt from the bucket's result files. Rows come back in the shape
 * S3Store already turns into views, so photos still get signed URLs from the bucket.
 */

export type PgSighting = {
  id: string;
  seenAt: string;
  label: string;
  confidence: number | null;
  locationDescription?: string | null;
  box: Box;
  zone: string | null;
  snapshotKey: string;
  width: number;
  height: number;
};
export type PgItem = { name: string; lostCount: number; seen: PgSighting | null };
export type PgResult = {
  id: string;
  at: string;
  transcript: string;
  targets: string[];
  found: boolean | null;
  snapshotKey: string;
  width: number;
  height: number;
  match: PgSighting | null;
};

type SightingRow = {
  det_id: string | null;
  label: string | null;
  confidence: number | null;
  location_description: string | null;
  bbox: Box | null;
  zone: string | null;
  seen_at: Date | null;
  key: string | null;
  width: number | null;
  height: number | null;
};

const g = globalThis as { __ctrlfPool?: Pool };

export const pgEnabled = () => Boolean(process.env.DATABASE_URL);

function pool(): Pool {
  return (g.__ctrlfPool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 4, connectionTimeoutMillis: 2000 }));
}

/** Boxes remain normalized; SnapshotFrame positions them with percentages. */
function sighting(r: SightingRow): PgSighting | null {
  if (!r.det_id || !r.bbox || !r.seen_at || !r.key || !r.width || !r.height) return null;
  const { x, y, w, h } = r.bbox;
  return {
    id: r.det_id,
    seenAt: r.seen_at.toISOString(),
    label: r.label ?? "",
    confidence: r.confidence,
    locationDescription: r.location_description,
    box: { x, y, w, h },
    zone: r.zone,
    snapshotKey: r.key,
    width: r.width,
    height: r.height,
  };
}

/** Columns every sighting query returns, from detections d, photos p and zones z. */
const SIGHTING = `d.id::text AS det_id, d.label, d.confidence, d.location_description, d.bbox, z.name AS zone, d.seen_at,
  p.s3_key AS key, p.width, p.height`;

/** Every tracked item with its newest sighting (the one cached in items.last_photo_id). */
export async function pgItems(): Promise<PgItem[]> {
  const { rows } = await pool().query(
    `SELECT i.name, i.lost_count, ${SIGHTING}
       FROM items i
       LEFT JOIN photos p ON p.id = i.last_photo_id
       LEFT JOIN LATERAL (SELECT * FROM detections WHERE item_id = i.id AND photo_id = i.last_photo_id
                          ORDER BY confidence DESC NULLS LAST, id LIMIT 1) d ON true
       LEFT JOIN zones z ON z.id = d.zone_id`,
  );
  return rows.map((r) => ({ name: r.name, lostCount: r.lost_count, seen: sighting(r) }));
}

/** One sighting per photo for an item, newest first. */
export async function pgSightings(name: string, limit: number, before?: string): Promise<PgSighting[]> {
  const { rows } = await pool().query(
    `SELECT * FROM (
       SELECT DISTINCT ON (d.photo_id) ${SIGHTING}
         FROM detections d
         JOIN items i ON i.id = d.item_id
         JOIN photos p ON p.id = d.photo_id
         LEFT JOIN zones z ON z.id = d.zone_id
        WHERE i.name = $1 AND ($3::timestamptz IS NULL OR d.seen_at < $3::timestamptz)
        ORDER BY d.photo_id, d.confidence DESC NULLS LAST, d.id) s
      ORDER BY seen_at DESC LIMIT $2`,
    [name, limit, before ?? null],
  );
  return rows.map(sighting).filter((s): s is PgSighting => s !== null);
}

/** The newest photos, each with the question it answered (if any) and the box for what was asked. */
export async function pgResults(limit: number): Promise<PgResult[]> {
  const { rows } = await pool().query(
    `SELECT coalesce(j.id, p.id)::text AS id, p.taken_at, j.transcript, j.targets, j.found,
            p.s3_key AS snapshot_key, p.width AS photo_width, p.height AS photo_height,
            ${SIGHTING}
       FROM photos p
       LEFT JOIN jobs j ON j.id = p.job_id
       LEFT JOIN LATERAL (SELECT * FROM detections WHERE photo_id = p.id AND label = lower(j.targets[1])
                          ORDER BY confidence DESC NULLS LAST, id LIMIT 1) d ON true
       LEFT JOIN zones z ON z.id = d.zone_id
      ORDER BY p.taken_at DESC LIMIT $1`,
    [limit],
  );
  return rows.map((r) => ({
    id: r.id,
    at: r.taken_at.toISOString(),
    transcript: r.transcript ?? "",
    targets: r.targets ?? [],
    found: r.found,
    snapshotKey: r.snapshot_key,
    width: r.photo_width,
    height: r.photo_height,
    match: sighting(r),
  }));
}
