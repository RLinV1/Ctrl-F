/** Private S3 device request contract, shared by discovery and reconstruction. */
export type DeviceRequest = {
  version: 1; source: "device"; id: string; created_at: string; captured_at: string;
  audio_key: string; image_key: string; audio_content_type: "audio/ogg";
};
export const DEVICE_PREFIX = "incoming/device/";
export const deviceId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id);

export function deviceRequest(key: string, value: unknown): DeviceRequest | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (v.version !== 1 || v.source !== "device" || typeof v.id !== "string" || !deviceId(v.id)) return null;
  if (key !== `${DEVICE_PREFIX}${v.id}.ready.json` || v.audio_key !== `${DEVICE_PREFIX}${v.id}.ogg`
    || v.image_key !== `${DEVICE_PREFIX}${v.id}.jpeg` || v.audio_content_type !== "audio/ogg") return null;
  for (const field of ["created_at", "captured_at"] as const) {
    if (typeof v[field] !== "string" || !/(Z|[+-]\d{2}:\d{2})$/.test(v[field]) || !Number.isFinite(Date.parse(v[field]))) return null;
  }
  return v as DeviceRequest;
}
