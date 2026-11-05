/**
 * Minimal ZIP writer for generated OOXML documents.
 *
 * A .docx is a ZIP container. Word accepts entries stored without compression,
 * so this writer needs only CRC-32 and the ZIP record structures — no
 * third-party dependency, no network, and deterministic bytes for a given set
 * of entries (the timestamp is fixed). That keeps the single-file build small
 * and makes the generated file reproducible for its golden test.
 *
 * Adapter code: it writes bytes and knows nothing about case semantics.
 */

export type ZipEntry = {
  /** Entry path inside the container, e.g. `word/document.xml`. */
  path: string;
  data: Uint8Array;
};

const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_HEADER_SIGNATURE = 0x02014b50;
const EOCD_SIGNATURE = 0x06054b50;
const VERSION = 20;
const UTF8_FLAG = 0x0800;
/** 1980-01-01, the earliest DOS date, fixed for reproducibility. */
const DOS_DATE = 0x0021;
const DOS_TIME = 0;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Build a valid ZIP archive with stored (uncompressed) entries. */
export function createStoredZip(entries: readonly ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder();
  const prepared = entries.map((entry) => {
    const name = encoder.encode(entry.path);
    return {
      name,
      data: entry.data,
      crc: crc32(entry.data),
      offset: 0,
    };
  });

  let localSize = 0;
  for (const entry of prepared) {
    entry.offset = localSize;
    localSize += 30 + entry.name.length + entry.data.length;
  }
  let centralSize = 0;
  for (const entry of prepared) {
    centralSize += 46 + entry.name.length;
  }

  const bytes = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(bytes.buffer);

  let offset = 0;
  for (const entry of prepared) {
    view.setUint32(offset, LOCAL_HEADER_SIGNATURE, true);
    view.setUint16(offset + 4, VERSION, true);
    view.setUint16(offset + 6, UTF8_FLAG, true);
    view.setUint16(offset + 8, 0, true); // stored
    view.setUint16(offset + 10, DOS_TIME, true);
    view.setUint16(offset + 12, DOS_DATE, true);
    view.setUint32(offset + 14, entry.crc, true);
    view.setUint32(offset + 18, entry.data.length, true);
    view.setUint32(offset + 22, entry.data.length, true);
    view.setUint16(offset + 26, entry.name.length, true);
    view.setUint16(offset + 28, 0, true);
    bytes.set(entry.name, offset + 30);
    bytes.set(entry.data, offset + 30 + entry.name.length);
    offset += 30 + entry.name.length + entry.data.length;
  }

  const centralOffset = offset;
  for (const entry of prepared) {
    view.setUint32(offset, CENTRAL_HEADER_SIGNATURE, true);
    view.setUint16(offset + 4, VERSION, true); // made by
    view.setUint16(offset + 6, VERSION, true); // needed
    view.setUint16(offset + 8, UTF8_FLAG, true);
    view.setUint16(offset + 10, 0, true);
    view.setUint16(offset + 12, DOS_TIME, true);
    view.setUint16(offset + 14, DOS_DATE, true);
    view.setUint32(offset + 16, entry.crc, true);
    view.setUint32(offset + 20, entry.data.length, true);
    view.setUint32(offset + 24, entry.data.length, true);
    view.setUint16(offset + 28, entry.name.length, true);
    view.setUint16(offset + 30, 0, true); // extra
    view.setUint16(offset + 32, 0, true); // comment
    view.setUint16(offset + 34, 0, true); // disk
    view.setUint16(offset + 36, 0, true); // internal attributes
    view.setUint32(offset + 38, 0, true); // external attributes
    view.setUint32(offset + 42, entry.offset, true);
    bytes.set(entry.name, offset + 46);
    offset += 46 + entry.name.length;
  }

  view.setUint32(offset, EOCD_SIGNATURE, true);
  view.setUint16(offset + 4, 0, true);
  view.setUint16(offset + 6, 0, true);
  view.setUint16(offset + 8, prepared.length, true);
  view.setUint16(offset + 10, prepared.length, true);
  view.setUint32(offset + 12, centralSize, true);
  view.setUint32(offset + 16, centralOffset, true);
  view.setUint16(offset + 20, 0, true);

  return bytes;
}
