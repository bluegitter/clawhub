export function buildDeterministicZip(files: Array<{ name: string; data: Uint8Array }>): Uint8Array {
  const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name));

  const parts: Uint8Array[] = [];
  let offset = 0;

  const entries: Array<{ name: string; crc: number; size: number; offset: number }> = [];
  const writer = {
    write(data: Uint8Array) {
      parts.push(data);
      offset += data.length;
    },
  };

  for (const file of sorted) {
    const localHeaderOffset = offset;
    const crc = crc32(file.data);

    writeLocalFileHeader(writer, file.name, crc, file.data.length);
    writer.write(file.data);

    entries.push({ name: file.name, crc, size: file.data.length, offset: localHeaderOffset });
  }

  const centralDirOffset = offset;
  for (const entry of entries) {
    writeCentralDirEntry(writer, entry);
  }
  const centralDirSize = offset - centralDirOffset;

  writeEndOfCentralDir(writer, entries.length, centralDirSize, centralDirOffset);

  const total = offset;
  const result = new Uint8Array(total);
  let pos = 0;
  for (const part of parts) {
    result.set(part, pos);
    pos += part.length;
  }
  return result;
}

const LOCAL_FILE_HEADER_SIG = 0x04034b50;
const CENTRAL_DIR_SIG = 0x02014b50;
const END_CENTRAL_DIR_SIG = 0x06054b50;
const ZIP_STORE_COMPRESSION = 0;

function writeLocalFileHeader(
  w: { write: (d: Uint8Array) => void },
  name: string,
  crc: number,
  size: number,
) {
  const nameBytes = new TextEncoder().encode(name);
  const buf = new ArrayBuffer(30 + nameBytes.length);
  const view = new DataView(buf);

  view.setUint32(0, LOCAL_FILE_HEADER_SIG, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, ZIP_STORE_COMPRESSION, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, 0, true);
  view.setUint32(14, crc, true);
  view.setUint32(18, size, true);
  view.setUint32(22, size, true);
  view.setUint16(26, nameBytes.length, true);
  view.setUint16(28, 0, true);
  new Uint8Array(buf).set(nameBytes, 30);

  w.write(new Uint8Array(buf));
}

function writeCentralDirEntry(
  w: { write: (d: Uint8Array) => void },
  entry: { name: string; crc: number; size: number; offset: number },
) {
  const nameBytes = new TextEncoder().encode(entry.name);
  const buf = new ArrayBuffer(46 + nameBytes.length);
  const view = new DataView(buf);

  view.setUint32(0, CENTRAL_DIR_SIG, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, ZIP_STORE_COMPRESSION, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, 0, true);
  view.setUint32(16, entry.crc, true);
  view.setUint32(20, entry.size, true);
  view.setUint32(24, entry.size, true);
  view.setUint16(28, nameBytes.length, true);
  view.setUint16(30, 0, true);
  view.setUint16(32, 0, true);
  view.setUint16(34, 0, true);
  view.setUint16(36, 0, true);
  view.setUint32(38, 0x20, true);
  view.setUint32(42, entry.offset, true);
  new Uint8Array(buf).set(nameBytes, 46);

  w.write(new Uint8Array(buf));
}

function writeEndOfCentralDir(
  w: { write: (d: Uint8Array) => void },
  count: number,
  centralDirSize: number,
  centralDirOffset: number,
) {
  const buf = new ArrayBuffer(22);
  const view = new DataView(buf);

  view.setUint32(0, END_CENTRAL_DIR_SIG, true);
  view.setUint16(4, 0, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, count, true);
  view.setUint16(10, count, true);
  view.setUint32(12, centralDirSize, true);
  view.setUint32(16, centralDirOffset, true);
  view.setUint16(20, 0, true);

  w.write(new Uint8Array(buf));
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
