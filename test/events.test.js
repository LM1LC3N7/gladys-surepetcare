// -----------------------------------------------------------------------------
// The scene events of the pets, from two readings.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCENE_TRIGGERS } from '../src/constants.js';
import { petEvents, snapshotOf } from '../src/events.js';
import { MINUTE, NOW } from './fixtures/surepetcare.js';

const pet = (overrides = {}) => ({
  where: 1,
  since: NOW - 60 * MINUTE,
  flapId: '2002',
  byHand: false,
  feeding: { at: NOW - 90 * MINUTE, amount: 12, deviceId: '2004' },
  ...overrides,
});

test('the first reading of a pet is history, not news', () => {
  assert.deepEqual(petEvents(undefined, pet(), NOW), { events: [], stale: [] });
});

test('nothing changed, nothing fired', () => {
  const before = pet();
  assert.deepEqual(petEvents(snapshotOf(before), pet(), NOW).events, []);
});

test('going out and coming in, with the flap used', () => {
  const inside = pet();
  const outside = pet({ where: 2, since: NOW - MINUTE });
  assert.deepEqual(petEvents(snapshotOf(inside), outside, NOW).events, [
    { key: SCENE_TRIGGERS.PET_WENT_OUT, at: NOW - MINUTE, flapId: '2002', byHand: false },
  ]);
  const back = pet({ since: NOW, flapId: null, byHand: true });
  assert.deepEqual(petEvents(snapshotOf(outside), back, NOW).events, [
    { key: SCENE_TRIGGERS.PET_CAME_IN, at: NOW, flapId: null, byHand: true },
  ]);
});

test('out and back between two readings: the last move only', () => {
  const before = pet();
  const after = pet({ since: NOW - 2 * MINUTE });
  assert.deepEqual(
    petEvents(snapshotOf(before), after, NOW).events.map((e) => e.key),
    [SCENE_TRIGGERS.PET_CAME_IN],
  );
});

test('a meal of 1 g or more, once', () => {
  const before = pet();
  const fed = pet({ feeding: { at: NOW - MINUTE, amount: 7.5, deviceId: '2004' } });
  assert.deepEqual(petEvents(snapshotOf(before), fed, NOW).events, [
    { key: SCENE_TRIGGERS.PET_ATE, at: NOW - MINUTE, feederId: '2004', amount: 7.5 },
  ]);
  assert.deepEqual(petEvents(snapshotOf(fed), fed, NOW).events, []);
  const sniffed = pet({ feeding: { at: NOW - MINUTE, amount: 0.4, deviceId: '2004' } });
  assert.deepEqual(petEvents(snapshotOf(before), sniffed, NOW).events, []);
});

test('changes older than 15 minutes when first seen are not fired', () => {
  const before = pet();
  const late = pet({ where: 2, since: NOW - 40 * MINUTE });
  const result = petEvents(snapshotOf(before), late, NOW);
  assert.deepEqual(result.events, []);
  assert.equal(result.stale[0].key, SCENE_TRIGGERS.PET_WENT_OUT);
});

test('an unknown position fires nothing', () => {
  const before = pet();
  assert.deepEqual(petEvents(snapshotOf(before), pet({ where: undefined }), NOW).events, []);
});
