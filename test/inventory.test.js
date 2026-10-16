// -----------------------------------------------------------------------------
// The me/start answer -> households, devices and pets.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  batteryOf,
  bowlCountOf,
  consumedOf,
  lastMealOf,
  lockModeOf,
  readAccount,
  timeOf,
} from '../src/inventory.js';
import { FEEDER, FELIX, MINUTE, NOW, meStart } from './fixtures/surepetcare.js';

const account = () => readAccount(meStart());
const byId = (list, id) => list.find((e) => e.id === String(id));

test('the devices of the account, the unsupported ones apart', () => {
  const { households, devices, pets, skipped } = account();
  assert.deepEqual([...households.values()], [{ id: '1001', name: 'Maison' }]);
  assert.deepEqual(
    devices.map((d) => [d.id, d.kind]),
    [
      ['2001', 'hub'],
      ['2002', 'flap'],
      ['2003', 'flap'],
      ['2004', 'feeder'],
      ['2005', 'felaqua'],
    ],
  );
  assert.deepEqual(
    skipped.map((d) => d.productId),
    [2],
  );
  assert.equal(pets.length, 3);
  assert.equal(byId(devices, 2002).parentId, '2001');
  assert.equal(byId(devices, 2003).parentId, '2001', 'parent.id of older answers');
});

test('batteries: the percentage of the API, else the voltage of four AA cells', () => {
  assert.equal(batteryOf({ battery: 6.1, battery_percentage: 87 }), 87);
  assert.equal(batteryOf({ battery: 5.6 }), 42);
  assert.equal(batteryOf({ battery: 6.6 }), 100);
  assert.equal(batteryOf({ battery: 4.4 }), 0);
  assert.equal(batteryOf({ battery: null }), undefined);
  assert.equal(batteryOf({}), undefined);
  const { devices } = account();
  assert.equal(byId(devices, 2001).battery, undefined, 'the hub has no battery');
  assert.equal(byId(devices, 2005).battery, 64);
});

test('lock modes, the curfew first', () => {
  const flap = (mode, curfew) => ({ status: { locking: { mode } }, control: { curfew } });
  assert.equal(lockModeOf(flap(0)), 'unlocked');
  assert.equal(lockModeOf(flap(1)), 'keep_in');
  assert.equal(lockModeOf(flap(2)), 'keep_out');
  assert.equal(lockModeOf(flap(3)), 'locked');
  assert.equal(lockModeOf(flap(4)), 'curfew');
  assert.equal(lockModeOf(flap(-1)), 'curfew');
  assert.equal(lockModeOf(flap(-2)), 'curfew');
  const on = { enabled: true, lock_time: '19:00', unlock_time: '07:00' };
  assert.equal(lockModeOf(flap(0, [on])), 'curfew', 'an enabled curfew with mode 0');
  assert.equal(lockModeOf(flap(0, on)), 'curfew', 'the pet door holds one object');
  assert.equal(lockModeOf(flap(0, [{ ...on, enabled: false }])), 'unlocked');
  assert.equal(lockModeOf(flap(9)), undefined);
  assert.equal(lockModeOf({}), undefined);
  const { devices } = account();
  assert.equal(byId(devices, 2002).lockMode, 'keep_in');
  assert.deepEqual(byId(devices, 2002).curfew.shape, 'array');
  assert.equal(byId(devices, 2003).lockMode, 'curfew');
  assert.deepEqual(byId(devices, 2003).curfew.shape, 'object');
});

test('bowls: one big bowl or two halves, with their weights', () => {
  assert.equal(bowlCountOf({ control: { bowls: { type: 1, settings: [{}, {}] } } }), 1);
  assert.equal(bowlCountOf({ control: { bowls: { type: 4, settings: [{}, {}] } } }), 2);
  assert.equal(bowlCountOf({ status: { bowl_status: [{}] } }), 1);
  assert.equal(bowlCountOf({}), 0);
  const feeder = byId(account().devices, FEEDER);
  assert.deepEqual(feeder.bowls, [
    { index: 0, weight: 32.4, percent: 65 },
    { index: 1, weight: 18, percent: 36 },
  ]);
  assert.deepEqual(byId(account().devices, 2005).water, { index: 0, weight: 412.6, percent: 41 });
});

test('pets: where, since when, through which flap, their last meal and drink', () => {
  const { pets } = account();
  const felix = byId(pets, FELIX);
  assert.equal(felix.where, 1);
  assert.equal(felix.since, NOW - 18 * MINUTE);
  assert.equal(felix.flapId, '2002');
  assert.equal(felix.byHand, false);
  assert.deepEqual(felix.feeding, { at: NOW - 30 * MINUTE, amount: 9.6, deviceId: '2004' });
  assert.deepEqual(felix.drinking, { at: NOW - 25 * MINUTE, amount: 14.4, deviceId: '2005' });
  const tom = byId(pets, 3003);
  assert.equal(tom.byHand, true);
  assert.equal(tom.since, Date.UTC(2026, 9, 15, 22, 0, 0), 'no offset: UTC');
  assert.equal(tom.feeding, undefined);
  assert.equal(byId(pets, 3002).where, 2);
});

test('dates, amounts and the last meal of a feeder', () => {
  assert.equal(timeOf('2026-10-16 07:00:00'), Date.UTC(2026, 9, 16, 7));
  assert.equal(timeOf('2026-10-16T09:00:00+02:00'), Date.UTC(2026, 9, 16, 7));
  assert.equal(timeOf(''), undefined);
  assert.equal(timeOf('yesterday'), undefined);
  assert.equal(consumedOf([-6.2, 0.4, -3.4]), 9.6, 'refills are not eaten');
  assert.equal(consumedOf(undefined), 0);
  const { devices, pets } = account();
  const meal = lastMealOf(byId(devices, FEEDER), pets);
  assert.equal(meal.petName, 'Felix');
  assert.equal(meal.amount, 9.6);
  assert.equal(lastMealOf(byId(devices, 2005), pets), undefined);
});

test('odd answers do not break the reading', () => {
  const empty = readAccount({});
  assert.equal(empty.devices.length + empty.pets.length, 0);
  const odd = readAccount({
    devices: [null, { id: 7, product_id: 6 }, { product_id: 1 }],
    pets: [{ id: 8, position: { where: 5 } }],
  });
  assert.equal(odd.devices.length, 1);
  assert.equal(odd.devices[0].lockMode, undefined);
  assert.equal(odd.pets[0].where, undefined);
  assert.equal(odd.households.size, 0);
});
