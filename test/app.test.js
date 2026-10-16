// -----------------------------------------------------------------------------
// End to end: the real SDK wiring (src/handlers.js) against the SDK's fake
// Gladys and a fake Sure Petcare cloud behind the transport. Timers and Date
// are mocked: the tests move the clock second by second, like the scheduler
// sees it.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEVICE_TRANSPORTS, createLogger } from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { SurePetcareApp } from '../src/app.js';
import { accountKey } from '../src/config.js';
import { ACTIONS, SCENE_TRIGGERS } from '../src/constants.js';
import { registerHandlers } from '../src/handlers.js';
import {
  CAT_FLAP,
  DAY,
  EMAIL,
  FEEDER,
  FELIX,
  MINUTE,
  NALA,
  NOW,
  PASSWORD,
  PET_DOOR,
} from './fixtures/surepetcare.js';
import { fakeSurePetcare, memoryStore, settle } from './helpers/fakeSurePetcare.js';

const CONFIG = { email: EMAIL, password: PASSWORD };
const dev = (id) => `ext:test-integration:device:${id}`;
const pet = (id) => `ext:test-integration:pet:${id}`;
const iso = (ms) => new Date(ms).toISOString();

async function setup(
  t,
  { config = CONFIG, store = memoryStore(), server = fakeSurePetcare() } = {},
) {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: NOW });
  const gladys = createFakeGladys({ config });
  const app = new SurePetcareApp({
    gladys,
    logger: createLogger({ level: 'silent' }),
    transport: server.transport,
    now: () => Date.now(),
    store,
    randomId: () => 'client-1',
    userAgent: 'gladys-surepetcare/test',
  });
  registerHandlers(gladys, app);
  await gladys.connect();
  await settle();
  t.after(() => app.stop());
  const advance = async (ms) => {
    for (let elapsed = 0; elapsed < ms; elapsed += 1000) {
      t.mock.timers.tick(1000);
      await settle();
    }
  };
  return { gladys, app, server, store, advance };
}

const deviceOf = (gladys, id) => gladys.fake.discoveredDevices.find((d) => d.external_id === id);
const featureOf = (gladys, id, role) =>
  deviceOf(gladys, id).features.find((f) => f.external_id === `${id}:${role}`);
const create = async (gladys, ...ids) => {
  for (const id of ids) {
    await gladys.fake.deviceCreated(deviceOf(gladys, id));
  }
  await settle();
};
const statesOf = (gladys, featureId) =>
  gladys.fake.states.filter((s) => s.device_feature_external_id === featureId);
const badgeOf = (gladys, id) =>
  gladys.fake.transports.filter((b) => b.device_external_id === id).at(-1);
const setLock = (gladys, id, value) => {
  const device = deviceOf(gladys, dev(id));
  return gladys.fake.setValue(device, featureOf(gladys, dev(id), 'lock-mode'), value);
};

test('without credentials, the status asks for them and nothing is requested', async (t) => {
  const { gladys, server, store } = await setup(t, { config: {} });
  assert.equal(server.requests.length, 0);
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /e-mail and password/);
  assert.equal(store.data.deviceId, 'client-1', 'the client id is made once');
  const ack = await gladys.fake.action(ACTIONS.TEST_CONNECTION);
  assert.match(ack.data.message.fr, /e-mail et le mot de passe/);
});

test('one sign-in, one read: devices and pets in Discovery, the session expiry in the status', async (t) => {
  const { gladys, server, store, advance } = await setup(t);
  assert.deepEqual(
    server.requests.map((r) => r.path),
    ['/auth/login', '/me/start'],
  );
  assert.equal(server.logins()[0].body.device_id, 'client-1');
  assert.equal(gladys.fake.discoveredDevices.length, 8);
  const status = gladys.fake.connectionStatus;
  assert.equal(status.connected, true);
  assert.equal(
    status.message.en,
    'Connected to Sure Petcare: 5 devices, 3 pets. Open Discovery to add them. Session valid until 2026-11-15.',
  );
  assert.match(status.message.fr, /5 appareils, 3 animaux.*Session valable jusqu'au 2026-11-15/);
  assert.equal(store.data.session.account, accountKey(EMAIL));
  assert.ok(server.tokens.has(store.data.session.token));
  // One read per minute.
  await advance(3 * MINUTE);
  assert.equal(server.reads().length, 4);
  assert.equal(server.logins().length, 1);
});

test('a restart reuses the client id and the session of the same account', async (t) => {
  const server = fakeSurePetcare();
  const token = server.issue();
  const store = memoryStore({
    deviceId: 'client-9',
    session: { account: accountKey(EMAIL), token, expiresAt: NOW + 10 * DAY },
  });
  const { gladys } = await setup(t, { server, store });
  assert.equal(server.logins().length, 0);
  assert.equal(server.reads()[0].headers['X-Device-Id'], 'client-9');
  assert.equal(gladys.fake.connectionStatus.connected, true);

  const other = fakeSurePetcare();
  const foreign = memoryStore({
    deviceId: 'client-9',
    session: { account: accountKey('someone@else.org'), token: other.issue() },
  });
  t.mock.timers.reset();
  await setup(t, { server: other, store: foreign });
  assert.equal(other.logins().length, 1, 'the session of another account is not used');
});

test('created devices get their values and badges', async (t) => {
  const { gladys } = await setup(t);
  await create(gladys, dev(CAT_FLAP), dev(PET_DOOR), dev(FEEDER), dev(2005), dev(2001));
  const last = (id, role) => gladys.fake.lastState(`${dev(id)}:${role}`);
  assert.equal(last(CAT_FLAP, 'lock-mode'), 'keep_in');
  assert.equal(last(CAT_FLAP, 'battery'), 42);
  assert.equal(last(CAT_FLAP, 'online'), 1);
  assert.equal(last(PET_DOOR, 'lock-mode'), 'curfew');
  assert.equal(last(PET_DOOR, 'battery'), 87);
  assert.equal(last(PET_DOOR, 'online'), 0);
  assert.equal(last(FEEDER, 'bowl-0'), 32);
  assert.equal(last(FEEDER, 'last-meal'), 9.6);
  assert.equal(last(FEEDER, 'last-meal-pet'), 'Felix');
  assert.equal(last(2005, 'water'), 413);
  assert.equal(last(2005, 'water-level'), 41);
  assert.equal(last(2001, 'online'), 1);
  assert.equal(badgeOf(gladys, dev(CAT_FLAP)).transport, DEVICE_TRANSPORTS.CLOUD);
  assert.deepEqual(badgeOf(gladys, dev(PET_DOOR)), {
    device_external_id: dev(PET_DOOR),
    transport: DEVICE_TRANSPORTS.UNREACHABLE,
    degraded: true,
    message: {
      en: 'The hub reports this device offline.',
      fr: 'Le hub signale cet appareil hors ligne.',
    },
  });
  assert.equal(statesOf(gladys, `${dev(2002)}:battery`).length, 1);
  assert.equal(statesOf(gladys, `${dev(2004)}:last-meal`)[0].created_at, iso(NOW - 30 * MINUTE));
});

test('a pet: inside since when, the minutes there, its meal; dated values once each', async (t) => {
  const { gladys, advance } = await setup(t);
  await create(gladys, pet(FELIX), pet(NALA));
  const presence = statesOf(gladys, `${pet(FELIX)}:presence`);
  assert.deepEqual(presence, [
    {
      device_feature_external_id: `${pet(FELIX)}:presence`,
      state: 1,
      created_at: iso(NOW - 18 * MINUTE),
    },
  ]);
  assert.equal(gladys.fake.lastState(`${pet(FELIX)}:location-duration`), 18);
  assert.equal(gladys.fake.lastState(`${pet(FELIX)}:last-meal`), 9.6);
  assert.equal(gladys.fake.lastState(`${pet(FELIX)}:last-drink`), 14);
  assert.equal(gladys.fake.lastState(`${pet(NALA)}:presence`), 0);
  assert.equal(badgeOf(gladys, pet(FELIX)).transport, DEVICE_TRANSPORTS.CLOUD);
  await advance(MINUTE);
  assert.equal(gladys.fake.lastState(`${pet(FELIX)}:location-duration`), 19);
  assert.equal(statesOf(gladys, `${pet(FELIX)}:presence`).length, 1, 'not sent twice');
  assert.equal(statesOf(gladys, `${pet(FELIX)}:last-meal`).length, 1);
});

test('scene events: a pet goes out, eats, comes back in; old changes are not fired', async (t) => {
  const { gladys, server, advance } = await setup(t);
  await create(gladys, pet(FELIX));
  assert.deepEqual(gladys.fake.sceneEvents, [], 'nothing at the first reading');

  const felix = server.pet(FELIX);
  await advance(10_000);
  felix.position = { tag_id: 5001, device_id: CAT_FLAP, where: 2, since: iso(Date.now()) };
  await advance(MINUTE);
  assert.deepEqual(gladys.fake.sceneEvents, [
    {
      key: SCENE_TRIGGERS.PET_WENT_OUT,
      data: {
        pet: pet(FELIX),
        pet_name: 'Felix',
        flap: dev(CAT_FLAP),
        flap_name: 'Chatière cuisine',
        by_hand: false,
        since: iso(NOW + 10_000),
      },
    },
  ]);
  assert.equal(gladys.fake.lastState(`${pet(FELIX)}:presence`), 0);
  assert.equal(gladys.fake.lastState(`${pet(FELIX)}:location-duration`), 0);

  felix.status.feeding = {
    tag_id: 5001,
    device_id: FEEDER,
    change: [-4.2, 0],
    at: iso(Date.now()),
  };
  await advance(MINUTE);
  assert.deepEqual(gladys.fake.sceneEvents.at(-1), {
    key: SCENE_TRIGGERS.PET_ATE,
    data: {
      pet: pet(FELIX),
      pet_name: 'Felix',
      feeder: dev(FEEDER),
      feeder_name: 'Distributeur',
      amount: 4.2,
      at: iso(NOW + 70_000),
    },
  });

  felix.position = { tag_id: 5001, user_id: 4001, where: 1, since: iso(Date.now()) };
  await advance(MINUTE);
  const back = gladys.fake.sceneEvents.at(-1);
  assert.equal(back.key, SCENE_TRIGGERS.PET_CAME_IN);
  assert.equal(back.data.by_hand, true);
  assert.equal(back.data.flap, null);
  assert.equal(back.data.flap_name, '');

  const count = gladys.fake.sceneEvents.length;
  await advance(2 * MINUTE);
  assert.equal(gladys.fake.sceneEvents.length, count, 'each change fires once');

  // A move 40 minutes old, seen only now (the app was offline): history.
  server.pet(NALA).position = {
    device_id: PET_DOOR,
    where: 1,
    since: iso(Date.now() - 40 * MINUTE),
  };
  await advance(MINUTE);
  assert.equal(gladys.fake.sceneEvents.length, count);
});

test('the lock mode is set from Gladys, and wins over readings that do not show it yet', async (t) => {
  const { gladys, server, advance } = await setup(t);
  await create(gladys, dev(CAT_FLAP));
  const ack = await setLock(gladys, CAT_FLAP, 'keep_out');
  assert.equal(ack.success, true);
  assert.deepEqual(server.controls().at(-1).body, { locking: 2 });
  assert.equal(server.controls().at(-1).path, `/device/${CAT_FLAP}/control`);
  assert.equal(gladys.fake.lastState(`${dev(CAT_FLAP)}:lock-mode`), 'keep_out');

  // The hub has not applied it yet: the readings still say "keep in".
  server.device(CAT_FLAP).status.locking.mode = 1;
  await advance(MINUTE);
  assert.equal(gladys.fake.lastState(`${dev(CAT_FLAP)}:lock-mode`), 'keep_out');
  await advance(2 * MINUTE);
  assert.equal(gladys.fake.lastState(`${dev(CAT_FLAP)}:lock-mode`), 'keep_in');
});

test('curfew: enabled with the times of the flap; another mode turns it off first', async (t) => {
  const { gladys, server, store, advance } = await setup(t);
  await create(gladys, dev(CAT_FLAP), dev(PET_DOOR));

  assert.equal((await setLock(gladys, CAT_FLAP, 'curfew')).success, true);
  assert.deepEqual(server.controls().at(-1).body, {
    curfew: [
      { enabled: true, lock_time: '19:00', unlock_time: '07:00' },
      { enabled: true, lock_time: '12:00', unlock_time: '13:00' },
    ],
  });

  // The pet door holds one curfew object, enabled: "locked" disables it, then locks.
  const before = server.controls().length;
  assert.equal((await setLock(gladys, PET_DOOR, 'locked')).success, true);
  assert.deepEqual(
    server
      .controls()
      .slice(before)
      .map((r) => r.body),
    [{ curfew: { enabled: false, lock_time: '21:30', unlock_time: '06:30' } }, { locking: 3 }],
  );
  assert.deepEqual(store.data.curfews, { [PET_DOOR]: [0] });

  // Right after a command, the next one starts from what was sent, not from
  // the reading of a minute ago.
  const cat = server.controls().length;
  await setLock(gladys, CAT_FLAP, 'keep_in');
  assert.deepEqual(
    server
      .controls()
      .slice(cat)
      .map((r) => Object.keys(r.body)),
    [['curfew'], ['locking']],
  );

  // Only the entries enabled last time come back (the app changed them).
  server.device(CAT_FLAP).control.curfew = [
    { enabled: true, lock_time: '19:00', unlock_time: '07:00' },
    { enabled: false, lock_time: '12:00', unlock_time: '13:00' },
  ];
  await advance(11_000);
  await setLock(gladys, CAT_FLAP, 'unlocked');
  await setLock(gladys, CAT_FLAP, 'curfew');
  assert.deepEqual(
    server
      .controls()
      .at(-1)
      .body.curfew.map((e) => e.enabled),
    [true, false],
  );
});

test('commands that cannot be done are refused with a reason', async (t) => {
  const { gladys, server } = await setup(t);
  server.device(CAT_FLAP).control.curfew = [];
  await gladys.fake.scanRequest();
  t.mock.timers.tick(31_000);
  await gladys.fake.scanRequest();
  await settle();
  const noTimes = await setLock(gladys, CAT_FLAP, 'curfew');
  assert.equal(noTimes.success, false);
  assert.match(noTimes.error, /curfew|couvre-feu/i);
  assert.equal((await setLock(gladys, CAT_FLAP, 'open')).success, false);
  const battery = featureOf(gladys, dev(CAT_FLAP), 'battery');
  assert.equal(
    (await gladys.fake.setValue(deviceOf(gladys, dev(CAT_FLAP)), battery, 1)).success,
    false,
  );
  server.queue.push({
    match: (r) => r.method === 'PUT',
    status: 200,
    body: { data: { locking: 1 } },
  });
  const ignored = await setLock(gladys, CAT_FLAP, 'locked');
  assert.equal(ignored.success, false);
  assert.match(ignored.error, /did not apply|n'a pas appliqué/);
  server.queue.push({ match: (r) => r.method === 'PUT', status: 500, body: {} });
  const failed = await setLock(gladys, CAT_FLAP, 'locked');
  assert.match(failed.error, /HTTP 500/);
});

test('a refused token signs in again; a refused password waits for a change', async (t) => {
  const { gladys, server, advance } = await setup(t);
  server.tokens.clear();
  await advance(MINUTE);
  assert.equal(server.logins().length, 2);
  assert.equal(gladys.fake.connectionStatus.connected, true);

  server.password = 'changed';
  server.tokens.clear();
  await advance(MINUTE);
  assert.equal(server.logins().length, 3);
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /session expired/);
  await advance(10 * MINUTE);
  assert.equal(server.logins().length, 3, 'never signed in again by itself');

  // The button tries once.
  const ack = await gladys.fake.action(ACTIONS.TEST_CONNECTION);
  assert.match(ack.data.message.en, /refused/);
  assert.equal(server.logins().length, 4);

  await gladys.fake.configUpdated({ ...CONFIG, password: 'changed' });
  await settle();
  assert.equal(server.logins().length, 5);
  assert.equal(gladys.fake.connectionStatus.connected, true);
});

test('a wrong password at the start says so, and devices stay unreachable', async (t) => {
  const server = fakeSurePetcare();
  server.password = 'other';
  const { gladys } = await setup(t, { server });
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.fr, /refusé l'e-mail ou le mot de passe/);
  assert.equal(gladys.fake.discoveredDevices.length, 0);
});

test('Sure Petcare unreachable: a pause that grows, unreachable badges, then back', async (t) => {
  const { gladys, server, advance } = await setup(t);
  await create(gladys, dev(CAT_FLAP), pet(FELIX));
  server.down = true;
  await advance(MINUTE);
  const reads = server.reads().length;
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(
    gladys.fake.connectionStatus.message.en,
    /cannot be reached \(connection refused\)\. Next try in 1 min/,
  );
  assert.equal(badgeOf(gladys, dev(CAT_FLAP)).transport, DEVICE_TRANSPORTS.UNREACHABLE);
  assert.equal(badgeOf(gladys, pet(FELIX)).transport, DEVICE_TRANSPORTS.UNREACHABLE);
  await advance(MINUTE);
  assert.equal(server.reads().length, reads + 1);
  assert.match(gladys.fake.connectionStatus.message.en, /Next try in 2 min/);
  server.down = false;
  await advance(2 * MINUTE);
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.equal(badgeOf(gladys, dev(CAT_FLAP)).transport, DEVICE_TRANSPORTS.CLOUD);
});

test('too many requests: a pause as long as asked', async (t) => {
  const { gladys, server, advance } = await setup(t);
  server.queue.push({
    match: (r) => r.path === '/me/start',
    status: 429,
    body: '{}',
    headers: { 'retry-after': '600' },
  });
  await advance(MINUTE);
  const reads = server.reads().length;
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.match(gladys.fake.connectionStatus.message.en, /slow down: pausing for 10 min/);
  await advance(9 * MINUTE);
  assert.equal(server.reads().length, reads);
  await advance(2 * MINUTE);
  assert.ok(server.reads().length > reads);
});

test('the test button reads and summarizes, at most every 30 seconds', async (t) => {
  const { gladys, server } = await setup(t);
  const ack = await gladys.fake.action(ACTIONS.TEST_CONNECTION);
  assert.equal(ack.success, true);
  assert.equal(
    ack.data.message.en,
    '1 household, 5 devices, 3 pets. Felix: inside. Nala: outside. Tom: inside. Session valid until 2026-11-15.',
  );
  assert.match(ack.data.message.fr, /^1 foyer, 5 appareils, 3 animaux\. Felix : à l'intérieur\./);
  const reads = server.reads().length;
  const again = await gladys.fake.action(ACTIONS.TEST_CONNECTION);
  assert.match(again.data.message.en, /^Already read less than 30 seconds ago\. 1 household/);
  assert.equal(server.reads().length, reads);
});

test('a new interval reschedules, a new language renames, a scan reads again', async (t) => {
  const { gladys, server, advance } = await setup(t);
  await gladys.fake.configUpdated({ ...CONFIG, poll_interval: 300 });
  const reads = server.reads().length;
  await advance(4 * MINUTE);
  assert.equal(server.reads().length, reads);
  await advance(MINUTE);
  assert.equal(server.reads().length, reads + 1);

  await gladys.fake.configUpdated({ ...CONFIG, poll_interval: 300, language: 'en' });
  await settle();
  assert.equal(featureOf(gladys, dev(FEEDER), 'bowl-0').name, 'Left bowl (g)');
  assert.equal(server.logins().length, 1, 'same account: no new sign-in');

  await advance(40_000);
  await gladys.fake.scanRequest();
  await settle();
  assert.equal(server.reads().length, reads + 2);
});

test('after Gladys restarts, the status, devices and badges are sent again without a read', async (t) => {
  const { gladys, server } = await setup(t);
  await create(gladys, dev(CAT_FLAP));
  const reads = server.reads().length;
  const statuses = gladys.fake.connectionStatuses.length;
  const lists = gladys.fake.requests.filter((r) => r.path === '/discovered_device').length;
  await gladys.disconnect();
  await gladys.connect();
  await settle();
  assert.equal(server.reads().length, reads);
  assert.equal(gladys.fake.connectionStatuses.length, statuses + 1);
  assert.equal(
    gladys.fake.requests.filter((r) => r.path === '/discovered_device').length,
    lists + 1,
  );
  assert.equal(badgeOf(gladys, dev(CAT_FLAP)).transport, DEVICE_TRANSPORTS.CLOUD);
});
