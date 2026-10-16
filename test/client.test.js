// -----------------------------------------------------------------------------
// The session: sign-in, renewal before the token expires and once on a 401,
// one sign-in at a time.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SurePetcareClient } from '../src/client.js';
import { DAY, EMAIL, NOW, PASSWORD } from './fixtures/surepetcare.js';
import { fakeSurePetcare } from './helpers/fakeSurePetcare.js';

function setup(t, { lifetime } = {}) {
  t.mock.timers.enable({ apis: ['Date'], now: NOW });
  const server = fakeSurePetcare({ lifetime });
  const sessions = [];
  const client = new SurePetcareClient({
    transport: server.transport,
    now: () => Date.now(),
    userAgent: 'gladys-surepetcare/test',
    onSession: (session) => sessions.push(session),
  });
  client.configure({ email: EMAIL, password: PASSWORD, deviceId: 'client-1' });
  return { server, client, sessions };
}

test('the sign-in sends the e-mail, the password as JSON and the client id', async (t) => {
  const { server, client, sessions } = setup(t);
  const data = await client.start();
  assert.equal(data.pets.length, 3);
  const [login, read] = server.requests;
  assert.equal(login.path, '/auth/login');
  assert.deepEqual(login.body, { email_address: EMAIL, password: PASSWORD, device_id: 'client-1' });
  assert.equal(login.headers.Authorization, undefined);
  assert.equal(read.headers['User-Agent'], 'gladys-surepetcare/test');
  assert.equal(read.headers['X-Device-Id'], 'client-1');
  assert.ok(!JSON.stringify(read.headers).includes(PASSWORD));
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].expiresAt, Math.floor((NOW + 30 * DAY) / 1000) * 1000);
});

test('a session is reused, and renewed an hour before it expires', async (t) => {
  const { server, client } = setup(t, { lifetime: 3 * 3600_000 });
  await client.start();
  await client.start();
  assert.equal(server.logins().length, 1);
  t.mock.timers.tick(2 * 3600_000 + 1000);
  await client.start();
  assert.equal(server.logins().length, 2);
  assert.equal(server.reads().length, 3);
});

test('a stored session is used without signing in', async (t) => {
  const { server, client } = setup(t);
  const token = server.issue();
  client.configure({ email: EMAIL, password: PASSWORD, deviceId: 'client-1', session: { token } });
  await client.start();
  assert.equal(server.logins().length, 0);
});

test('a refused token signs in once and retries once', async (t) => {
  const { server, client } = setup(t);
  await client.start();
  server.tokens.clear();
  await client.start();
  assert.equal(server.logins().length, 2);
  assert.deepEqual(
    server.requests.map((r) => r.path),
    ['/auth/login', '/me/start', '/me/start', '/auth/login', '/me/start'],
  );
  // Refused again right after a new sign-in: the error goes up, no loop.
  server.queue.push({ match: (r) => r.path === '/me/start', status: 401, body: '{}' });
  server.queue.push({ match: (r) => r.path === '/me/start', status: 401, body: '{}' });
  await assert.rejects(client.start(), { kind: 'unauthorized' });
  assert.equal(server.logins().length, 3);
});

test('a wrong password is refused, and no request is sent without credentials', async (t) => {
  const { server, client } = setup(t);
  client.configure({ email: EMAIL, password: 'wrong', deviceId: 'client-1' });
  await assert.rejects(client.start(), { kind: 'refused', status: 401 });
  client.configure({ email: '', password: '', deviceId: 'client-1' });
  await assert.rejects(client.start(), { kind: 'no_credentials' });
  assert.equal(server.requests.length, 1);
});

test('calls at the same time share one sign-in', async (t) => {
  const { server, client } = setup(t);
  await Promise.all([client.start(), client.start(), client.control(2002, { locking: 2 })]);
  assert.equal(server.logins().length, 1);
  assert.equal(server.device(2002).status.locking.mode, 2);
});

test('a sign-in answer without a token is a bad response', async (t) => {
  const { server, client } = setup(t);
  server.queue.push({ match: (r) => r.path === '/auth/login', status: 200, body: { data: {} } });
  await assert.rejects(client.start(), { kind: 'bad_response' });
});
