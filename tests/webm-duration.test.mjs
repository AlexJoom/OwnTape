import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixWebmDuration, readWebmDurationMs } from '../extension/src/webm-duration.js';

// Minimal MediaRecorder-like layout: EBML header, Segment (unknown size),
// Info (TimecodeScale, MuxingApp), Tracks, Cluster.
function sampleWebm({ timecodeScale = [0x0f, 0x42, 0x40] } = {}) {
  const ebml = [0x1a, 0x45, 0xdf, 0xa3, 0x84, 0x42, 0x86, 0x81, 0x01];
  const segment = [0x18, 0x53, 0x80, 0x67, 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff];
  const tcs = [0x2a, 0xd7, 0xb1, 0x80 | timecodeScale.length, ...timecodeScale];
  const muxer = [0x4d, 0x80, 0x84, 0x43, 0x68, 0x72, 0x6d]; // "Chrm"
  const info = [0x15, 0x49, 0xa9, 0x66, 0x80 | (tcs.length + muxer.length), ...tcs, ...muxer];
  const tracks = [0x16, 0x54, 0xae, 0x6b, 0x80];
  const cluster = [0x1f, 0x43, 0xb6, 0x75, 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xe7, 0x81, 0x00];
  const payload = new Uint8Array(1000).fill(7);
  return new Blob([new Uint8Array([...ebml, ...segment, ...info, ...tracks, ...cluster]), payload], { type: 'video/webm' });
}

test('adds Duration to a file without one', async () => {
  const input = sampleWebm();
  assert.equal(await readWebmDurationMs(input), null);
  const out = await fixWebmDuration(input, 123456);
  assert.equal(await readWebmDurationMs(out), 123456);
  // Only the Info element grows; the rest of the file is unchanged.
  const inBytes = new Uint8Array(await input.arrayBuffer());
  const outBytes = new Uint8Array(await out.arrayBuffer());
  assert.deepEqual(outBytes.slice(-1015), inBytes.slice(-1015));
});

test('replaces an existing Duration', async () => {
  const once = await fixWebmDuration(sampleWebm(), 1000);
  const twice = await fixWebmDuration(once, 5000);
  assert.equal(await readWebmDurationMs(twice), 5000);
  assert.equal(twice.size, once.size);
});

test('respects a non-default TimecodeScale', async () => {
  const input = sampleWebm({ timecodeScale: [0x98, 0x96, 0x80] }); // 10 ms ticks
  const out = await fixWebmDuration(input, 2500);
  assert.equal(await readWebmDurationMs(out), 2500);
});

test('returns the input when the data is not WebM', async () => {
  const input = new Blob([new Uint8Array(100)]);
  assert.equal(await fixWebmDuration(input, 1000), input);
});
