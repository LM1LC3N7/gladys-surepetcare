// -----------------------------------------------------------------------------
// The configuration and the state kept in /data.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { accountKey, normalizeConfig } from '../src/config.js';
import { fileStore, normalizeMemory } from '../src/store.js';

test('the configuration, bounded', () => {
  assert.deepEqual(normalizeConfig({}), {
    email: '',
    password: '',
    account: '',
    pollInterval: 60,
    language: 'fr',
  });
  const c = normalizeConfig({
    email: ' Chat@Example.com ',
    password: ' spaces kept ',
    poll_interval: 5,
    language: 'EN',
  });
  assert.equal(c.email, 'Chat@Example.com');
  assert.equal(c.password, ' spaces kept ');
  assert.equal(c.pollInterval, 30);
  assert.equal(c.language, 'en');
  assert.equal(normalizeConfig({ poll_interval: 9999 }).pollInterval, 600);
  assert.equal(normalizeConfig({ poll_interval: 'x', language: 'de' }).language, 'fr');
  assert.equal(
    c.account,
    accountKey('chat@example.com'),
    'case and spaces do not change the account',
  );
  assert.equal(c.account.length, 16);
  assert.ok(!c.account.includes('chat'));
});

test('the state of /data, repaired', () => {
  assert.deepEqual(normalizeMemory(null), { deviceId: null, session: null, curfews: {} });
  assert.deepEqual(
    normalizeMemory({
      deviceId: 'abc',
      session: { account: 'k', token: 't', expiresAt: 5 },
      curfews: { 2002: [0, 1], 2003: ['x'] },
    }),
    {
      deviceId: 'abc',
      session: { account: 'k', token: 't', expiresAt: 5 },
      curfews: { 2002: [0, 1] },
    },
  );
  assert.equal(
    normalizeMemory({ session: { token: 't' } }).session,
    null,
    'no account, no session',
  );
  assert.equal(
    normalizeMemory({ session: { account: 'k', token: 't' } }).session.expiresAt,
    undefined,
  );
});

test('the file store writes atomically, readable by its owner only', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'surepetcare-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = fileStore(join(dir, 'state.json'));
  assert.equal(await store.load(), null);
  await store.save({ deviceId: 'abc' });
  assert.deepEqual(await store.load(), { deviceId: 'abc' });
  assert.equal(JSON.parse(await readFile(join(dir, 'state.json'), 'utf8')).deviceId, 'abc');
  assert.equal((await stat(join(dir, 'state.json'))).mode & 0o077, 0);
});
