const EXTENSIONS: Record<string, string> = { "audio/webm": "webm", "audio/mp4": "m4a", "audio/ogg": "ogg" };

/** File extension for a recorder MIME type ("audio/webm;codecs=opus" -> "webm"). Throws for anything but audio/webm, mp4, ogg. */
export function audioExtension(contentType: string): string {
  const ext = EXTENSIONS[contentType.split(";")[0].trim().toLowerCase()];
  if (!ext) throw new Error(`unsupported audio type: ${contentType}`);
  return ext;
}

export const AUDIO_KEY = /^audio\/[0-9a-f-]{36}\.(webm|m4a|ogg)$/;
