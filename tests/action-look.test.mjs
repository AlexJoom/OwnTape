import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ICONS_IDLE, ICONS_RECORDING, PRODUCT_NAME, READY_LOOK, STATE, actionLookFor } from '../extension/src/constants.js';

const MEET = 'https://meet.google.com/abc-defg-hij';

test('Meet call tab when idle: ready look', () => {
  const look = actionLookFor(STATE.IDLE, MEET);
  assert.equal(look.title, READY_LOOK.title);
  assert.equal(look.badgeText, READY_LOOK.badgeText);
  assert.deepEqual(look.icons, READY_LOOK.icons || ICONS_IDLE);
});

test('other tabs when idle: normal look, no badge', () => {
  for (const url of [undefined, 'https://meet.google.com/', 'https://example.com/abc-defg-hij']) {
    const look = actionLookFor(STATE.IDLE, url);
    assert.equal(look.title, PRODUCT_NAME);
    assert.equal(look.badgeText, '');
  }
});

test('the recording look always wins, on every tab', () => {
  for (const state of [STATE.STARTING, STATE.RECORDING, STATE.STOPPING]) {
    for (const url of [MEET, undefined]) {
      const look = actionLookFor(state, url);
      assert.match(look.title, /recording/);
      assert.equal(look.badgeText, '');
      assert.deepEqual(look.icons, ICONS_RECORDING);
    }
  }
});
