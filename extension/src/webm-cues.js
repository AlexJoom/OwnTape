// Makes a MediaRecorder WebM file easy to seek in players and editors.
//
// Chrome writes the Segment and every Cluster with "unknown size" and no
// index. This module reads the file once (in slices, memory stays bounded),
// finds every keyframe and the exact duration, and builds a new file:
//
//   EBML header | Segment (known size)
//     SeekHead -> Info, Tracks, Cues
//     Info (with Duration) | Tracks
//     Clusters (unchanged bytes, a lazy Blob slice; no copy)
//     Cues (one CuePoint per video keyframe)
//
// If the file has a layout that this code does not expect, it throws. The
// caller then falls back to the duration-only fix (webm-duration.js).

const ID = {
  EBML: 0x1a45dfa3,
  SEGMENT: 0x18538067,
  SEEKHEAD: 0x114d9b74,
  SEEK: 0x4dbb,
  SEEK_ID: 0x53ab,
  SEEK_POSITION: 0x53ac,
  INFO: 0x1549a966,
  TIMECODE_SCALE: 0x2ad7b1,
  DURATION: 0x4489,
  TRACKS: 0x1654ae6b,
  TRACK_ENTRY: 0xae,
  TRACK_NUMBER: 0xd7,
  TRACK_TYPE: 0x83,
  CLUSTER: 0x1f43b675,
  TIMECODE: 0xe7,
  SIMPLE_BLOCK: 0xa3,
  BLOCK_GROUP: 0xa0,
  BLOCK: 0xa1,
  VOID: 0xec,
  CUES: 0x1c53bb6b,
  CUE_POINT: 0xbb,
  CUE_TIME: 0xb3,
  CUE_TRACK_POSITIONS: 0xb7,
  CUE_TRACK: 0xf7,
  CUE_CLUSTER_POSITION: 0xf1,
  CUE_RELATIVE_POSITION: 0xf0,
};
// IDs that end an unknown-size Cluster (they can only occur at Segment level).
const SEGMENT_LEVEL = new Set([
  ID.CLUSTER, ID.CUES, ID.SEEKHEAD, ID.INFO, ID.TRACKS,
  0x1254c367 /* Tags */, 0x1043a770 /* Chapters */, 0x1941a469 /* Attachments */,
]);

const HEAD_BYTES = 256 * 1024;
const SLICE_BYTES = 8 * 1024 * 1024;

// ---------- EBML reading ----------

function vintLength(firstByte) {
  for (let len = 1; len <= 8; len++) if (firstByte & (0x80 >> (len - 1))) return len;
  throw new Error('Invalid EBML vint');
}

/** Reads an element header at `pos` of `bytes`. Returns null if incomplete. */
function readHeader(bytes, pos) {
  if (pos >= bytes.length) return null;
  const idLen = vintLength(bytes[pos]);
  if (idLen > 4) throw new Error('Invalid EBML id');
  if (pos + idLen >= bytes.length) return null;
  const sizeLen = vintLength(bytes[pos + idLen]);
  if (pos + idLen + sizeLen > bytes.length) return null;
  let id = 0;
  for (let i = 0; i < idLen; i++) id = id * 256 + bytes[pos + i];
  let size = bytes[pos + idLen] & (0xff >> sizeLen);
  let allOnes = size === 0xff >> sizeLen;
  for (let i = 1; i < sizeLen; i++) {
    const b = bytes[pos + idLen + i];
    size = size * 256 + b;
    if (b !== 0xff) allOnes = false;
  }
  return { id, size: allOnes ? -1 : size, headerLen: idLen + sizeLen };
}

function readUint(bytes, pos, len) {
  let v = 0;
  for (let i = 0; i < len; i++) v = v * 256 + bytes[pos + i];
  return v;
}

/** Iterates the children of an element whose data is fully in `bytes`. */
function* children(bytes, start, end) {
  let pos = start;
  while (pos < end) {
    const h = readHeader(bytes, pos);
    if (!h || h.size < 0) throw new Error('Unexpected element in header');
    const dataStart = pos + h.headerLen;
    yield { ...h, start: pos, dataStart, end: dataStart + h.size };
    pos = dataStart + h.size;
  }
}

// ---------- EBML writing ----------

function idBytes(id) {
  const out = [];
  for (let v = id; v > 0; v = Math.floor(v / 256)) out.unshift(v % 256);
  return out;
}

function sizeBytes(size, forceLen = 0) {
  let len = forceLen || 1;
  while (!forceLen && size >= 2 ** (7 * len) - 1) len++;
  const out = new Array(len);
  let v = size;
  for (let i = len - 1; i >= 0; i--) {
    out[i] = v % 256;
    v = Math.floor(v / 256);
  }
  out[0] |= 0x80 >> (len - 1);
  return out;
}

function uintBytes(value) {
  const out = [];
  let v = value;
  do {
    out.unshift(v % 256);
    v = Math.floor(v / 256);
  } while (v > 0);
  return out;
}

function element(id, payload) {
  return [...idBytes(id), ...sizeBytes(payload.length), ...payload];
}

const uintElement = (id, value) => element(id, uintBytes(value));

// ---------- Scanning ----------

/** Reads a Blob forward with a sliding window. */
class Reader {
  constructor(blob) {
    this.blob = blob;
    this.start = 0;
    this.bytes = new Uint8Array(0);
  }
  /** Makes [pos, pos+n) available. Returns false at end of file. */
  async ensure(pos, n) {
    if (pos >= this.start && pos + n <= this.start + this.bytes.length) return true;
    if (pos >= this.blob.size) return false;
    const end = Math.min(this.blob.size, pos + Math.max(n, SLICE_BYTES));
    this.bytes = new Uint8Array(await this.blob.slice(pos, end).arrayBuffer());
    this.start = pos;
    return pos + n <= end;
  }
  header(pos) {
    return readHeader(this.bytes, pos - this.start);
  }
  byte(pos) {
    return this.bytes[pos - this.start];
  }
  uint(pos, len) {
    return readUint(this.bytes, pos - this.start, len);
  }
}

/**
 * Scans clusters from `pos` to the end. Returns keyframe cue points, the
 * largest block timecode, and the end of the last complete element (a crash
 * can leave a partial block at the end; it is cut off).
 */
async function scanClusters(blob, pos, videoTrack, onProgress, deadline) {
  const r = new Reader(blob);
  const cues = [];
  let maxTime = 0;
  let validEnd = pos;
  let cluster = null; // { pos, dataStart, time, sizeLen, knownSize }
  const clusters = []; // closed clusters: { pos, dataStart, sizeLen, knownSize, end }
  const closeCluster = (end) => {
    if (cluster) clusters.push({ ...cluster, end });
    cluster = null;
  };
  let lastReport = 0;

  while (pos < blob.size && (await r.ensure(pos, Math.min(12, blob.size - pos)))) {
    if (Date.now() > deadline) throw new Error('Index scan took too long');
    const h = r.header(pos);
    if (!h) break; // partial header at end of file
    const dataStart = pos + h.headerLen;
    let blockTime = null; // applied only when the whole block is in the file
    let blockCue = null;

    if (h.id === ID.CLUSTER) {
      closeCluster(pos);
      cluster = { pos, dataStart, time: 0, sizeLen: h.headerLen - 4, knownSize: h.size };
      validEnd = dataStart;
      pos = dataStart; // descend into the cluster
      continue;
    }
    if (cluster && h.id === ID.TIMECODE) {
      if (!(await r.ensure(dataStart, h.size))) break;
      cluster.time = r.uint(dataStart, h.size);
    } else if (cluster && (h.id === ID.SIMPLE_BLOCK || h.id === ID.BLOCK_GROUP)) {
      // Block header: track number (vint), int16 relative time, flags.
      let blockStart = dataStart;
      if (h.id === ID.BLOCK_GROUP) {
        if (!(await r.ensure(dataStart, 16))) break;
        const inner = r.header(dataStart);
        if (!inner || inner.id !== ID.BLOCK) throw new Error('BlockGroup without Block first');
        blockStart = dataStart + inner.headerLen;
      }
      if (!(await r.ensure(blockStart, 4))) break;
      const trackLen = vintLength(r.byte(blockStart));
      const track = r.uint(blockStart, trackLen) & (2 ** (7 * trackLen) - 1);
      const raw = r.uint(blockStart + trackLen, 2);
      const time = cluster.time + (raw > 0x7fff ? raw - 0x10000 : raw);
      const flags = r.byte(blockStart + trackLen + 2);
      blockTime = time;
      const keyframe = h.id === ID.SIMPLE_BLOCK && (flags & 0x80) !== 0;
      if (track === videoTrack && keyframe) {
        blockCue = { time, clusterPos: cluster.pos, relPos: pos - cluster.dataStart };
      }
    } else if (SEGMENT_LEVEL.has(h.id)) {
      closeCluster(pos); // ends an unknown-size cluster; skip the element
      if (h.size < 0) throw new Error('Unknown-size element after clusters');
    } else if (h.id === ID.VOID) {
      // padding: skip
    } else if (!cluster) {
      throw new Error(`Unexpected element 0x${h.id.toString(16)} at segment level`);
    }

    if (h.size < 0) throw new Error('Unknown-size element inside a cluster');
    const next = dataStart + h.size;
    if (next > blob.size) break; // partial element at end of file
    if (blockTime !== null && blockTime > maxTime) maxTime = blockTime;
    if (blockCue) cues.push(blockCue);
    pos = next;
    validEnd = next;

    if (onProgress && pos - lastReport > 32 * 1024 * 1024) {
      lastReport = pos;
      onProgress(pos / blob.size);
    }
  }
  closeCluster(validEnd);
  return { cues, maxTime, validEnd, clusters };
}

// ---------- Main ----------

/**
 * @param {Blob} blob  WebM from MediaRecorder.
 * @param {object} [opts]
 * @param {(fraction: number) => void} [opts.onProgress]
 * @param {number} [opts.timeoutMs=120000]  Give up after this time (caller falls back).
 * @returns {Promise<{ blob: Blob, durationMs: number, cueCount: number }>}
 */
export async function addWebmIndex(blob, { onProgress, timeoutMs = 120_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  const head = new Uint8Array(await blob.slice(0, HEAD_BYTES).arrayBuffer());

  // EBML header
  const ebml = readHeader(head, 0);
  if (!ebml || ebml.id !== ID.EBML || ebml.size < 0) throw new Error('Not an EBML file');
  const ebmlEnd = ebml.headerLen + ebml.size;

  // Segment
  const seg = readHeader(head, ebmlEnd);
  if (!seg || seg.id !== ID.SEGMENT) throw new Error('No Segment');
  let pos = ebmlEnd + seg.headerLen;

  // Elements before the first Cluster: only Info, Tracks and Void are accepted.
  let info = null;
  let tracks = null;
  for (;;) {
    const h = readHeader(head, pos);
    if (!h) throw new Error('Header is longer than expected');
    if (h.id === ID.CLUSTER) break;
    if (h.size < 0 || pos + h.headerLen + h.size > head.length) throw new Error('Header element too large');
    const el = { start: pos, dataStart: pos + h.headerLen, end: pos + h.headerLen + h.size };
    if (h.id === ID.INFO) info = el;
    else if (h.id === ID.TRACKS) tracks = el;
    else if (h.id !== ID.VOID) throw new Error(`Unsupported element 0x${h.id.toString(16)} before clusters`);
    pos = el.end;
  }
  const firstCluster = pos;
  if (!info || !tracks) throw new Error('Info or Tracks missing');

  // Info: keep all children except Duration; read TimecodeScale.
  let timecodeScale = 1_000_000;
  const infoKept = [];
  for (const c of children(head, info.dataStart, info.end)) {
    if (c.id === ID.TIMECODE_SCALE) timecodeScale = readUint(head, c.dataStart, c.size);
    if (c.id !== ID.DURATION) infoKept.push(...head.subarray(c.start, c.end));
  }

  // Tracks: find the video track number (TrackType 1).
  let videoTrack = null;
  for (const entry of children(head, tracks.dataStart, tracks.end)) {
    if (entry.id !== ID.TRACK_ENTRY) continue;
    let number = null;
    let type = null;
    for (const c of children(head, entry.dataStart, entry.end)) {
      if (c.id === ID.TRACK_NUMBER) number = readUint(head, c.dataStart, c.size);
      if (c.id === ID.TRACK_TYPE) type = readUint(head, c.dataStart, c.size);
    }
    if (type === 1) videoTrack = number;
  }
  if (videoTrack === null) throw new Error('No video track');

  const scan = await scanClusters(blob, firstCluster, videoTrack, onProgress, deadline);
  if (scan.cues.length === 0) throw new Error('No keyframes found');
  const durationTicks = scan.maxTime;
  const durationMs = (durationTicks * timecodeScale) / 1_000_000;

  // ---- build the new Segment prefix ----
  const durationBuf = new ArrayBuffer(8);
  new DataView(durationBuf).setFloat64(0, durationTicks);
  const infoBytes = element(ID.INFO, [...infoKept, ...element(ID.DURATION, [...new Uint8Array(durationBuf)])]);
  const tracksBytes = [...head.subarray(tracks.start, tracks.end)];

  // SeekHead with fixed-width (8-byte) positions, so its size does not depend on them.
  const seekEntry = (id, position) =>
    element(ID.SEEK, [...element(ID.SEEK_ID, idBytes(id)), ...idBytes(ID.SEEK_POSITION), 0x88, ...pos8(position)]);
  const pos8 = (v) => {
    const out = new Array(8);
    for (let i = 7, x = v; i >= 0; i--, x = Math.floor(x / 256)) out[i] = x % 256;
    return out;
  };
  const seekHeadLen = element(ID.SEEKHEAD, [...seekEntry(ID.INFO, 0), ...seekEntry(ID.TRACKS, 0), ...seekEntry(ID.CUES, 0)]).length;
  const infoPos = seekHeadLen;
  const tracksPos = infoPos + infoBytes.length;
  const clustersPos = tracksPos + tracksBytes.length;
  const clustersLen = scan.validEnd - firstCluster;
  const cuesPos = clustersPos + clustersLen;
  const shift = clustersPos - (firstCluster - (ebmlEnd + seg.headerLen));
  const seekHead = element(ID.SEEKHEAD, [
    ...seekEntry(ID.INFO, infoPos),
    ...seekEntry(ID.TRACKS, tracksPos),
    ...seekEntry(ID.CUES, cuesPos),
  ]);
  if (seekHead.length !== seekHeadLen) throw new Error('SeekHead size changed');

  const segmentDataStart = ebmlEnd + seg.headerLen;
  const cuePoints = [];
  for (const c of scan.cues) {
    const clusterPos = c.clusterPos - segmentDataStart + shift;
    cuePoints.push(
      ...element(ID.CUE_POINT, [
        ...uintElement(ID.CUE_TIME, c.time),
        ...element(ID.CUE_TRACK_POSITIONS, [
          ...uintElement(ID.CUE_TRACK, videoTrack),
          ...uintElement(ID.CUE_CLUSTER_POSITION, clusterPos),
          ...uintElement(ID.CUE_RELATIVE_POSITION, c.relPos),
        ]),
      ]),
    );
  }
  const cues = element(ID.CUES, cuePoints);

  const segmentSize = seekHead.length + infoBytes.length + tracksBytes.length + clustersLen + cues.length;
  const prefix = new Uint8Array([
    ...head.subarray(0, ebmlEnd),
    ...idBytes(ID.SEGMENT),
    ...sizeBytes(segmentSize, 8),
    ...seekHead,
    ...infoBytes,
    ...tracksBytes,
  ]);
  onProgress?.(1);
  // Clusters: same bytes, but each unknown size (8-byte vint) becomes the
  // real size, so no unknown-size element sits inside the known-size Segment.
  const parts = [prefix];
  let copied = firstCluster;
  for (const c of scan.clusters) {
    const realSize = c.end - c.dataStart;
    if (c.knownSize >= 0) {
      if (c.knownSize !== realSize) throw new Error('Cluster size mismatch');
      continue;
    }
    if (c.sizeLen !== 8) throw new Error('Unknown cluster size is not 8 bytes');
    const sizePos = c.pos + 4;
    parts.push(blob.slice(copied, sizePos), new Uint8Array(sizeBytes(realSize, 8)));
    copied = sizePos + 8;
  }
  parts.push(blob.slice(copied, scan.validEnd), new Uint8Array(cues));
  return {
    blob: new Blob(parts, {
      type: blob.type || 'video/webm',
    }),
    durationMs,
    cueCount: scan.cues.length,
  };
}
