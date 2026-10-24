/** A minimal ZIP writer (entries stored, not compressed: the photos are JPEGs, which do not shrink). */

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function record(size: number, write: (v: DataView) => void): Uint8Array {
  const bytes = new Uint8Array(size);
  write(new DataView(bytes.buffer));
  return bytes;
}

/** Names must be plain ASCII. */
export function zip(files: { name: string; data: Uint8Array }[], when = new Date()): Uint8Array {
  const dosTime = (when.getHours() << 11) | (when.getMinutes() << 5) | (when.getSeconds() >> 1);
  const dosDate = ((when.getFullYear() - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const { name, data } of files) {
    const nameBytes = new TextEncoder().encode(name);
    const crc = crc32(data);
    const local = record(30, (v) => {
      v.setUint32(0, 0x04034b50, true);
      v.setUint16(4, 20, true); // version needed
      v.setUint16(8, 0, true); // method: stored
      v.setUint16(10, dosTime, true);
      v.setUint16(12, dosDate, true);
      v.setUint32(14, crc, true);
      v.setUint32(18, data.length, true);
      v.setUint32(22, data.length, true);
      v.setUint16(26, nameBytes.length, true);
    });
    chunks.push(local, nameBytes, data);
    central.push(
      record(46, (v) => {
        v.setUint32(0, 0x02014b50, true);
        v.setUint16(4, 20, true); // version made by
        v.setUint16(6, 20, true); // version needed
        v.setUint16(10, 0, true);
        v.setUint16(12, dosTime, true);
        v.setUint16(14, dosDate, true);
        v.setUint32(16, crc, true);
        v.setUint32(20, data.length, true);
        v.setUint32(24, data.length, true);
        v.setUint16(28, nameBytes.length, true);
        v.setUint32(42, offset, true);
      }),
      nameBytes,
    );
    offset += local.length + nameBytes.length + data.length;
  }

  const centralSize = central.reduce((sum, c) => sum + c.length, 0);
  const end = record(22, (v) => {
    v.setUint32(0, 0x06054b50, true);
    v.setUint16(8, files.length, true);
    v.setUint16(10, files.length, true);
    v.setUint32(12, centralSize, true);
    v.setUint32(16, offset, true);
  });

  const out = new Uint8Array(offset + centralSize + end.length);
  let at = 0;
  for (const part of [...chunks, ...central, end]) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}
