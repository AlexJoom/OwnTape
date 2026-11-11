import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addWebmIndex } from '../extension/src/webm-cues.js';

// ---------- build a MediaRecorder-like WebM ----------
const idB = (id) => { const o = []; for (let v = id; v > 0; v = Math.floor(v / 256)) o.unshift(v % 256); return o; };
const sz = (n) => { let len = 1; while (n >= 2 ** (7 * len) - 1) len++; const o = []; let v = n; for (let i = 0; i < len; i++) { o.unshift(v % 256); v = Math.floor(v / 256); } o[0] |= 0x80 >> (len - 1); return o; };
const el = (id, payload) => [...idB(id), ...sz(payload.length), ...payload];
const uint = (id, v) => el(id, v < 256 ? [v] : [v >> 8, v & 255]);
const UNKNOWN = [0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff];

function block(track, rel, key, len = 50) {
  return el(0xa3, [0x80 | track, (rel >> 8) & 255, rel & 255, key ? 0x80 : 0, ...new Array(len).fill(track)]);
}

/** clusters: [{ time, blocks: [[track, rel, key]] }] */
function sampleWebm(clusters) {
  const header = el(0x1a45dfa3, [...el(0x4282, [0x77, 0x65, 0x62, 0x6d])]); // DocType "webm"
  const info = el(0x1549a966, [...el(0x2ad7b1, [0x0f, 0x42, 0x40]), ...el(0x4d80, [0x43])]);
  const tracks = el(0x1654ae6b, [
    ...el(0xae, [...uint(0xd7, 1), ...uint(0x83, 1)]), // video
    ...el(0xae, [...uint(0xd7, 2), ...uint(0x83, 2)]), // audio
  ]);
  const body = clusters.flatMap((c) => [
    0x1f, 0x43, 0xb6, 0x75, ...UNKNOWN, ...uint(0xe7, c.time),
    ...c.blocks.flatMap(([t, rel, key]) => block(t, rel, key)),
  ]);
  return new Uint8Array([...header, 0x18, 0x53, 0x80, 0x67, ...UNKNOWN, ...info, ...tracks, ...body]);
}

// ---------- tiny parser for checks ----------
function readEl(b, pos) {
  let l = 1; while (!(b[pos] & (0x80 >> (l - 1)))) l++;
  let id = 0; for (let i = 0; i < l; i++) id = id * 256 + b[pos + i];
  const sp = pos + l; let sl = 1; while (!(b[sp] & (0x80 >> (sl - 1)))) sl++;
  let size = b[sp] & (0xff >> sl); for (let i = 1; i < sl; i++) size = size * 256 + b[sp + i];
  return { id, size, data: sp + sl, end: sp + sl + size };
}
function kids(b, start, end) { const out = []; for (let p = start; p < end;) { const e = readEl(b, p); out.push({ ...e, pos: p }); p = e.end; } return out; }
const num = (b, e) => { let v = 0; for (let i = e.data; i < e.end; i++) v = v * 256 + b[i]; return v; };

async function bytesOf(blob) { return new Uint8Array(await blob.arrayBuffer()); }

const CLUSTERS = [
  { time: 0, blocks: [[1, 0, true], [2, 0, false], [1, 33, false], [2, 20, false]] },
  { time: 1000, blocks: [[1, 0, false], [2, 5, false], [1, 600, true], [2, 610, false]] },
  { time: 2500, blocks: [[2, 0, false], [1, 10, true], [1, 43, false], [2, 1490, false]] },
];

test('builds a valid indexed file', async () => {
  const input = sampleWebm(CLUSTERS);
  const { blob, durationMs, cueCount } = await addWebmIndex(new Blob([input]));
  assert.equal(durationMs, 3990);
  assert.equal(cueCount, 3);

  const b = await bytesOf(blob);
  const ebml = readEl(b, 0);
  const seg = readEl(b, ebml.end);
  assert.equal(seg.id, 0x18538067);
  assert.equal(seg.end, b.length, 'Segment size covers the rest of the file');

  const top = kids(b, seg.data, seg.end);
  assert.deepEqual(top.map((e) => e.id.toString(16)), ['114d9b74', '1549a966', '1654ae6b', '1f43b675', '1f43b675', '1f43b675', '1c53bb6b']);

  // SeekHead entries point at the right elements.
  for (const seek of kids(b, top[0].data, top[0].end)) {
    const [idEl, posEl] = kids(b, seek.data, seek.end);
    const target = readEl(b, seg.data + num(b, posEl));
    assert.equal(target.id, num(b, idEl));
  }

  // Duration in Info.
  const dur = kids(b, top[1].data, top[1].end).find((e) => e.id === 0x4489);
  assert.equal(new DataView(b.buffer, dur.data, 8).getFloat64(0), 3990);

  // Each cue points at a cluster, and at a keyframe block of track 1.
  const cues = kids(b, top.at(-1).data, top.at(-1).end);
  const times = [];
  for (const cp of cues) {
    const [time, tpos] = kids(b, cp.data, cp.end);
    times.push(num(b, time));
    const [track, clusterPos, relPos] = kids(b, tpos.data, tpos.end);
    assert.equal(num(b, track), 1);
    const cluster = readEl(b, seg.data + num(b, clusterPos));
    assert.equal(cluster.id, 0x1f43b675);
    const blk = readEl(b, cluster.data + num(b, relPos));
    assert.equal(blk.id, 0xa3);
    assert.equal(b[blk.data] & 0x7f, 1);
    assert.ok(b[blk.data + 3] & 0x80, 'keyframe flag');
  }
  assert.deepEqual(times, [0, 1600, 2510]);
});

test('cuts a partial block at the end (crash)', async () => {
  const input = sampleWebm(CLUSTERS);
  const cut = input.subarray(0, input.length - 20); // inside the last block
  const { blob, durationMs } = await addWebmIndex(new Blob([cut]));
  assert.equal(durationMs, 2543);
  const b = await bytesOf(blob);
  const seg = readEl(b, readEl(b, 0).end);
  assert.equal(seg.end, b.length);
  const top = kids(b, seg.data, seg.end);
  assert.equal(top.at(-1).id, 0x1c53bb6b);
});

test('throws on data that is not WebM, so the caller can fall back', async () => {
  await assert.rejects(addWebmIndex(new Blob([new Uint8Array(100)])));
});

test('throws when there is no keyframe', async () => {
  const input = sampleWebm([{ time: 0, blocks: [[1, 0, false], [2, 0, false]] }]);
  await assert.rejects(addWebmIndex(new Blob([input])), /keyframe/);
});
