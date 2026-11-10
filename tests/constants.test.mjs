import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDownloadName, meetingCodeFromUrl } from '../extension/src/constants.js';

test('meeting code from Meet URLs', () => {
  assert.equal(meetingCodeFromUrl('https://meet.google.com/abc-defg-hij'), 'abc-defg-hij');
  assert.equal(meetingCodeFromUrl('https://meet.google.com/abc-defg-hij?authuser=1'), 'abc-defg-hij');
  assert.equal(meetingCodeFromUrl('https://meet.google.com/meet/abc-defg-hij'), 'abc-defg-hij');
  assert.equal(meetingCodeFromUrl('https://meet.google.com/'), null);
  assert.equal(meetingCodeFromUrl('https://meet.google.com/landing'), null);
  assert.equal(meetingCodeFromUrl('https://evil.example/abc-defg-hij'), null);
  assert.equal(meetingCodeFromUrl(undefined), null);
});

test('download name', () => {
  assert.equal(buildDownloadName('abc-defg-hij', new Date(2026, 10, 10, 9, 5)), 'meet-abc-defg-hij-2026-11-10-0905.webm');
  assert.equal(buildDownloadName(null, new Date(2026, 0, 2, 14, 30)), 'meet-tab-2026-01-02-1430.webm');
});
