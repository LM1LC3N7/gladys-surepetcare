// -----------------------------------------------------------------------------
// The account -> Gladys devices and states, checked by the SDK's fake Gladys
// (it refuses the payloads Gladys refuses).
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import {
  buildDevices,
  datedStates,
  deviceIds,
  deviceStates,
  parseFeatureId,
  petIds,
  petStates,
} from '../src/devices.js';
import { readAccount } from '../src/inventory.js';
import { FEEDER, FELIX, MINUTE, NOW, meStart } from './fixtures/surepetcare.js';

const gladys = createFakeGladys();
const account = readAccount(meStart());
const roles = (device) => device.features.map((f) => f.external_id.split(':').at(-1));

test('one device per Sure Petcare device and per pet, accepted by Gladys', async () => {
  const devices = buildDevices(gladys, account, 'fr');
  await gladys.publishDiscoveredDevices(devices);
  assert.deepEqual(
    devices.map((d) => [d.external_id, d.name]),
    [
      ['ext:test-integration:device:2001', 'Hub'],
      ['ext:test-integration:device:2002', 'Chatière cuisine'],
      ['ext:test-integration:device:2003', 'Porte garage'],
      ['ext:test-integration:device:2004', 'Distributeur'],
      ['ext:test-integration:device:2005', 'Fontaine'],
      ['ext:test-integration:pet:3001', 'Felix'],
      ['ext:test-integration:pet:3002', 'Nala'],
      ['ext:test-integration:pet:3003', 'Tom'],
    ],
  );
  const [hub, catFlap, , feeder, felaqua, felix] = devices;
  assert.deepEqual(roles(hub), ['online']);
  assert.deepEqual(roles(catFlap), ['lock-mode', 'battery', 'online']);
  assert.deepEqual(roles(feeder), [
    'bowl-0',
    'bowl-1',
    'last-meal',
    'last-meal-pet',
    'battery',
    'online',
  ]);
  assert.deepEqual(roles(felaqua), ['water', 'water-level', 'battery', 'online']);
  assert.deepEqual(roles(felix), ['presence', 'location-duration', 'last-meal', 'last-drink']);
  assert.deepEqual(catFlap.params, [
    { name: 'household', value: 'Maison' },
    { name: 'product_id', value: '6' },
    { name: 'serial_number', value: 'C010-1111111' },
    { name: 'sure_petcare_id', value: '2002' },
  ]);
});

test('the lock mode is a select Gladys can set, the rest is read only', () => {
  const [, catFlap] = buildDevices(gladys, account, 'en');
  const [lock, battery, online] = catFlap.features;
  assert.equal(lock.category, 'text');
  assert.equal(lock.type, 'select');
  assert.equal(lock.read_only, false);
  assert.equal(lock.has_feedback, true);
  assert.deepEqual(lock.supported_options, [
    { value: 'unlocked', label: 'Unlocked' },
    { value: 'keep_in', label: 'Keep pets in' },
    { value: 'keep_out', label: 'Keep pets out' },
    { value: 'locked', label: 'Locked' },
    { value: 'curfew', label: 'Curfew' },
  ]);
  assert.deepEqual(
    [battery.category, battery.unit, battery.read_only],
    ['battery', 'percent', true],
  );
  assert.deepEqual([online.category, online.type], ['input', 'binary']);
  const felix = buildDevices(gladys, account, 'en').find((d) => d.name === 'Felix');
  assert.deepEqual(
    felix.features.map((f) => [f.category, f.type, f.unit]),
    [
      ['presence-sensor', 'binary', undefined],
      ['duration', 'integer', 'minutes'],
      ['unknown', 'unknown', undefined],
      ['volume-sensor', 'integer', 'milliliter'],
    ],
  );
});

test('names in French or English, a single bowl and nameless devices', () => {
  const data = meStart();
  data.devices[3].control.bowls = { type: 1, settings: [{ food_type: 2, target: 40 }] };
  data.devices[1].name = '';
  const fr = buildDevices(gladys, readAccount(data), 'fr');
  assert.equal(fr[1].name, 'Chatière C010-1111111');
  assert.deepEqual(
    fr[3].features.map((f) => f.name),
    ['Gamelle (g)', 'Dernier repas (g)', 'Dernier repas de', 'Batterie', 'En ligne'],
  );
  const en = buildDevices(gladys, account, 'en');
  assert.deepEqual(
    en[3].features.slice(0, 2).map((f) => f.name),
    ['Left bowl (g)', 'Right bowl (g)'],
  );
  // A household without a feeder nor a Felaqua: the pets only get where they are.
  const bare = meStart();
  bare.devices = bare.devices.slice(0, 2);
  bare.pets = [bare.pets[1]];
  assert.deepEqual(roles(buildDevices(gladys, readAccount(bare), 'en')[2]), [
    'presence',
    'location-duration',
  ]);
});

test('the current values of the devices', async () => {
  const states = account.devices.flatMap((d) => deviceStates(deviceIds(gladys, d.id), d));
  await gladys.publishStates(states);
  const value = (id, role) =>
    states.find(
      (s) => s.device_feature_external_id === `ext:test-integration:device:${id}:${role}`,
    );
  assert.equal(value(2001, 'online').state, 1);
  assert.equal(value(2001, 'battery'), undefined);
  assert.equal(value(2002, 'lock-mode').text, 'keep_in');
  assert.equal(value(2002, 'battery').state, 42);
  assert.equal(value(2003, 'lock-mode').text, 'curfew');
  assert.equal(value(2003, 'online').state, 0);
  assert.equal(value(2004, 'bowl-0').state, 32);
  assert.equal(value(2004, 'bowl-1').state, 18);
  assert.equal(value(2005, 'water').state, 413);
  assert.equal(value(2005, 'water-level').state, 41);
});

test('a pet: where it is dated with since, the minutes there, its meal dated', () => {
  const felix = account.pets.find((p) => p.id === String(FELIX));
  const ids = petIds(gladys, FELIX);
  assert.deepEqual(petStates(ids, felix, NOW), [
    { device_feature_external_id: ids.feature('location-duration'), state: 18 },
  ]);
  assert.deepEqual(datedStates(ids, felix, { kind: 'pet', now: NOW }), [
    {
      device_feature_external_id: ids.feature('presence'),
      state: 1,
      created_at: new Date(NOW - 18 * MINUTE).toISOString(),
      key: `1@${NOW - 18 * MINUTE}`,
    },
    {
      device_feature_external_id: ids.feature('last-meal'),
      state: 9.6,
      created_at: new Date(NOW - 30 * MINUTE).toISOString(),
      key: String(NOW - 30 * MINUTE),
    },
    {
      device_feature_external_id: ids.feature('last-drink'),
      state: 14,
      created_at: new Date(NOW - 25 * MINUTE).toISOString(),
      key: String(NOW - 25 * MINUTE),
    },
  ]);
  const nala = account.pets.find((p) => p.name === 'Nala');
  assert.equal(datedStates(petIds(gladys, nala.id), nala, { kind: 'pet', now: NOW })[0].state, 0);
  // A date in the future (clock skew) is dated now.
  const ahead = { ...felix, since: NOW + MINUTE, feeding: undefined, drinking: undefined };
  assert.equal(
    datedStates(ids, ahead, { kind: 'pet', now: NOW })[0].created_at,
    new Date(NOW).toISOString(),
  );
});

test('the feeder: its last meal and who ate it', () => {
  const feeder = account.devices.find((d) => d.id === String(FEEDER));
  const ids = deviceIds(gladys, FEEDER);
  const states = datedStates(ids, feeder, { pets: account.pets, now: NOW });
  assert.deepEqual(
    states.map(({ device_feature_external_id: id, key: _key, ...value }) => [
      id.split(':').at(-1),
      value,
    ]),
    [
      ['last-meal', { state: 9.6, created_at: new Date(NOW - 30 * MINUTE).toISOString() }],
      ['last-meal-pet', { text: 'Felix', created_at: new Date(NOW - 30 * MINUTE).toISOString() }],
    ],
  );
});

test('feature ids give back the device and the role', () => {
  assert.deepEqual(parseFeatureId('ext:test-integration:device:2002:lock-mode'), {
    kind: 'device',
    id: '2002',
    role: 'lock-mode',
  });
  assert.equal(parseFeatureId('ext:test-integration:device:2002')?.role, undefined);
  assert.equal(parseFeatureId(undefined), undefined);
});
