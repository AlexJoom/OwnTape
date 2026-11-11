import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VIDEO_QUALITY, captureSize } from '../extension/src/constants.js';

const std = VIDEO_QUALITY.standard; // 1920x1080
const high = VIDEO_QUALITY.high; // 2560x1440

test('never larger than the tab (no upscaling)', () => {
  assert.deepEqual(captureSize(std, { width: 1236, height: 669 }), { width: 1236, height: 668 });
  assert.deepEqual(captureSize(high, { width: 1920, height: 1063 }), { width: 1920, height: 1062 });
});

test('a large tab is made smaller with the same aspect ratio', () => {
  assert.deepEqual(captureSize(std, { width: 2880, height: 1594 }), { width: 1920, height: 1062 });
  assert.deepEqual(captureSize(high, { width: 3840, height: 2000 }), { width: 2560, height: 1332 });
});

test('without the tab size, the preset maximum', () => {
  assert.deepEqual(captureSize(std, null), { width: 1920, height: 1080 });
});
