import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MIC_TEXTS, classifyMicError, micErrorDetail } from '../extension/src/mic-errors.js';

const e = (name, message = '') => ({ name, message });

test('NotAllowedError depends on the permission state', () => {
  assert.equal(classifyMicError(e('NotAllowedError'), 'denied'), 'blocked');
  assert.equal(classifyMicError(e('NotAllowedError'), 'prompt'), 'dismissed');
  // Chrome allows it, but the operating system refuses: not "blocked in Chrome".
  assert.equal(classifyMicError(e('NotAllowedError', 'Permission denied by system'), 'granted'), 'unreadable');
});

test('device problems are never reported as blocked or granted', () => {
  for (const state of ['granted', 'prompt', 'denied']) {
    assert.equal(classifyMicError(e('NotFoundError'), state), 'no-device');
    assert.equal(classifyMicError(e('OverconstrainedError'), state), 'no-device');
    assert.equal(classifyMicError(e('NotReadableError'), state), 'unreadable');
    assert.equal(classifyMicError(e('AbortError'), state), 'unreadable');
  }
});

test('every kind has texts, and the detail line names the error', () => {
  for (const kind of ['blocked', 'dismissed', 'no-device', 'unreadable']) {
    assert.ok(MIC_TEXTS[kind].title && MIC_TEXTS[kind].text);
  }
  assert.equal(micErrorDetail(e('NotReadableError', 'Could not start audio source')), 'NotReadableError: Could not start audio source');
  assert.equal(micErrorDetail(null), '');
});
