import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MIC_TEXTS, classifyMicError, extensionSiteSettingsUrl, micErrorDetail } from '../extension/src/mic-errors.js';

const e = (name, message = '') => ({ name, message });

test('NotAllowedError depends on the permission state', () => {
  assert.equal(classifyMicError(e('NotAllowedError'), 'denied'), 'blocked');
  // Fast rejection = Chrome showed no prompt; slow = the user closed it.
  assert.equal(classifyMicError(e('NotAllowedError'), 'prompt', 40), 'not-asked');
  assert.equal(classifyMicError(e('NotAllowedError'), 'prompt', 4000), 'dismissed');
  // No time given (offscreen document, which can never show a prompt).
  assert.equal(classifyMicError(e('NotAllowedError'), 'prompt'), 'not-asked');
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
  for (const kind of ['blocked', 'dismissed', 'not-asked', 'no-device', 'unreadable']) {
    assert.ok(MIC_TEXTS[kind].title && MIC_TEXTS[kind].text);
  }
  assert.equal(micErrorDetail(e('NotReadableError', 'Could not start audio source')), 'NotReadableError: Could not start audio source');
  assert.equal(micErrorDetail(null), '');
});

test('site settings URL for the extension origin', () => {
  assert.equal(
    extensionSiteSettingsUrl('abcdefghijklmnopabcdefghijklmnop'),
    'chrome://settings/content/siteDetails?site=chrome-extension%3A%2F%2Fabcdefghijklmnopabcdefghijklmnop',
  );
});
