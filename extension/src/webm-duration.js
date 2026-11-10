// Adds the Duration element to the Segment Info of a WebM file made by
// MediaRecorder. MediaRecorder writes a live stream with no duration, so
// players show no length and seeking does not work well.
//
// Only the start of the file is read into memory. The rest of the file stays a
// lazy Blob slice, so this works for multi-gigabyte recordings.

const ID_EBML = 0x1a45dfa3;
const ID_SEGMENT = 0x18538067;
const ID_SEEKHEAD = 0x114d9b74;
const ID_INFO = 0x1549a966;
const ID_TIMECODE_SCALE = 0x2ad7b1;
const ID_DURATION = 0x4489;
const ID_CLUSTER = 0x1f43b675;

const HEAD_BYTES = 64 * 1024;

function vintLength(firstByte) {
  for (let len = 1; len <= 8; len++) {
    if (firstByte & (0x80 >> (len - 1))) return len;
  }
  throw new Error('Invalid EBML vint');
}

function readId(bytes, pos) {
  const len = vintLength(bytes[pos]);
  if (len > 4) throw new Error('Invalid EBML id');
  let id = 0;
  for (let i = 0; i < len; i++) id = id * 256 + bytes[pos + i];
  return { id, len };
}

function readSize(bytes, pos) {
  const len = vintLength(bytes[pos]);
  let value = bytes[pos] & (0xff >> len);
  let allOnes = value === 0xff >> len;
  for (let i = 1; i < len; i++) {
    value = value * 256 + bytes[pos + i];
    if (bytes[pos + i] !== 0xff) allOnes = false;
  }
  return { size: allOnes ? -1 : value, len }; // -1 = unknown size
}

function readUint(bytes, pos, len) {
  let v = 0;
  for (let i = 0; i < len; i++) v = v * 256 + bytes[pos + i];
  return v;
}

/** Encodes a size as an 8-byte EBML vint. */
function encodeSize8(size) {
  const out = new Uint8Array(8);
  out[0] = 0x01;
  let v = size;
  for (let i = 7; i >= 1; i--) {
    out[i] = v % 256;
    v = Math.floor(v / 256);
  }
  return out;
}

function float64Bytes(value) {
  const buf = new ArrayBuffer(8);
  new DataView(buf).setFloat64(0, value);
  return new Uint8Array(buf);
}

/**
 * Finds the Info element. Returns null when the layout is not one that we can
 * patch safely (for example, a SeekHead whose offsets would become wrong).
 */
function locateInfo(bytes) {
  let pos = 0;
  const ebml = readId(bytes, pos);
  if (ebml.id !== ID_EBML) return null;
  pos += ebml.len;
  const ebmlSize = readSize(bytes, pos);
  pos += ebmlSize.len + ebmlSize.size;

  const seg = readId(bytes, pos);
  if (seg.id !== ID_SEGMENT) return null;
  pos += seg.len;
  pos += readSize(bytes, pos).len;

  while (pos < bytes.length - 12) {
    const el = readId(bytes, pos);
    const sz = readSize(bytes, pos + el.len);
    const dataStart = pos + el.len + sz.len;
    if (el.id === ID_SEEKHEAD || el.id === ID_CLUSTER) return null;
    if (el.id === ID_INFO) {
      if (sz.size < 0 || dataStart + sz.size > bytes.length) return null;
      return { start: pos, dataStart, end: dataStart + sz.size };
    }
    if (sz.size < 0) return null;
    pos = dataStart + sz.size;
  }
  return null;
}

/**
 * @param {Blob} blob     WebM data from MediaRecorder.
 * @param {number} durationMs
 * @returns {Promise<Blob>} A new Blob with the duration set, or the input Blob
 *   if the file layout is not recognised.
 */
export async function fixWebmDuration(blob, durationMs) {
  if (!(durationMs > 0)) return blob;
  const head = new Uint8Array(await blob.slice(0, HEAD_BYTES).arrayBuffer());
  let info;
  try {
    info = locateInfo(head);
  } catch {
    return blob;
  }
  if (!info) return blob;

  // Walk the Info children: read TimecodeScale, drop any old Duration.
  let timecodeScale = 1_000_000;
  const kept = [];
  let pos = info.dataStart;
  while (pos < info.end) {
    const el = readId(head, pos);
    const sz = readSize(head, pos + el.len);
    const dataStart = pos + el.len + sz.len;
    const next = dataStart + sz.size;
    if (sz.size < 0 || next > info.end) return blob;
    if (el.id === ID_TIMECODE_SCALE) timecodeScale = readUint(head, dataStart, sz.size);
    if (el.id !== ID_DURATION) kept.push(head.subarray(pos, next));
    pos = next;
  }

  const durationValue = (durationMs * 1_000_000) / timecodeScale;
  const durationEl = new Uint8Array([0x44, 0x89, 0x88, ...float64Bytes(durationValue)]);
  const bodyLength = kept.reduce((n, part) => n + part.length, 0) + durationEl.length;
  const infoHeader = new Uint8Array([0x15, 0x49, 0xa9, 0x66, ...encodeSize8(bodyLength)]);

  return new Blob(
    [blob.slice(0, info.start), infoHeader, ...kept, durationEl, blob.slice(info.end)],
    { type: blob.type || 'video/webm' },
  );
}

/** Reads the Duration (ms) from a WebM head. For tests and diagnostics. */
export async function readWebmDurationMs(blob) {
  const head = new Uint8Array(await blob.slice(0, HEAD_BYTES).arrayBuffer());
  const info = locateInfo(head);
  if (!info) return null;
  let timecodeScale = 1_000_000;
  let duration = null;
  let pos = info.dataStart;
  while (pos < info.end) {
    const el = readId(head, pos);
    const sz = readSize(head, pos + el.len);
    const dataStart = pos + el.len + sz.len;
    if (el.id === ID_TIMECODE_SCALE) timecodeScale = readUint(head, dataStart, sz.size);
    if (el.id === ID_DURATION) {
      const dv = new DataView(head.buffer, head.byteOffset + dataStart, sz.size);
      duration = sz.size === 4 ? dv.getFloat32(0) : dv.getFloat64(0);
    }
    pos = dataStart + sz.size;
  }
  return duration === null ? null : (duration * timecodeScale) / 1_000_000;
}
