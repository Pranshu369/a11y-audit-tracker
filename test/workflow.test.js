const test = require('node:test');
const assert = require('node:assert/strict');
const { STATUSES, TRANSITIONS, canTransition } = require('../src/workflow');

test('every transition target is a real status', () => {
  for (const [from, targets] of Object.entries(TRANSITIONS)) {
    assert.ok(STATUSES[from], `${from} is a status`);
    for (const to of targets) assert.ok(STATUSES[to], `${from} -> ${to} points at a status`);
  }
});

test('an issue cannot be verified before it is fixed', () => {
  assert.equal(canTransition('open', 'verified'), false);
  assert.equal(canTransition('in_progress', 'verified'), false);
  assert.equal(canTransition('fixed', 'verified'), true);
});

test('no status can transition to itself', () => {
  for (const s of Object.keys(STATUSES)) assert.equal(canTransition(s, s), false);
});
