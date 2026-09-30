const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_HEADER_SIGNATURE = 0x02014b50;
const MAX_ENTRIES = 5000;

/**
 * Reads an .xlsx (zip) central directory and returns the total declared
 * uncompressed size of its entries — without inflating anything — so a
 * "zip bomb" is refused before the workbook is parsed. Returns `null` when
 * the buffer isn't a well-formed zip, or uses zip64 (never needed for a
 * spreadsheet within the upload limit).
 */
export function declaredUncompressedSize(buffer: Buffer): number | null {
  const searchStart = Math.max(0, buffer.length - 65_557);
  let eocd = -1;
  for (let i = buffer.length - 22; i >= searchStart; i -= 1) {
    if (buffer.readUInt32LE(i) === EOCD_SIGNATURE) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;

  const entries = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  if (entries > MAX_ENTRIES || offset === 0xffffffff) return null;

  let total = 0;
  for (let i = 0; i < entries; i += 1) {
    if (
      offset + 46 > buffer.length ||
      buffer.readUInt32LE(offset) !== CENTRAL_HEADER_SIGNATURE
    ) {
      return null;
    }
    const size = buffer.readUInt32LE(offset + 24);
    if (size === 0xffffffff) return null;
    total += size;
    offset +=
      46 +
      buffer.readUInt16LE(offset + 28) +
      buffer.readUInt16LE(offset + 30) +
      buffer.readUInt16LE(offset + 32);
  }
  return total;
}

/** Zip local-file-header magic ("PK\x03\x04") — every real .xlsx starts with it. */
export const isZip = (buffer: Buffer): boolean =>
  buffer.length > 4 && buffer.readUInt32LE(0) === 0x04034b50;
