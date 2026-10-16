// -----------------------------------------------------------------------------
// The transport and the error kinds. The transport runs against a loopback
// HTTP server (127.0.0.1): no network.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {
  SurePetcareError,
  errorFor,
  errorReason,
  httpRequest,
  networkError,
  parseData,
  parseRetryAfter,
  tokenExpiry,
} from '../src/surepetcare.js';
import { jwt } from './fixtures/surepetcare.js';

async function loopback(t, handler) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test('a request sends its method, headers and body, and resolves whatever the status', async (t) => {
  let seen;
  const base = await loopback(t, (req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      seen = {
        method: req.method,
        url: req.url,
        auth: req.headers.authorization,
        body: Buffer.concat(chunks).toString(),
      };
      res.writeHead(422, { 'Content-Type': 'application/json', 'Retry-After': '5' });
      res.end('{"error":{}}');
    });
  });
  const answer = await httpRequest(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' },
    body: '{"a":1}',
  });
  assert.deepEqual(seen, {
    method: 'POST',
    url: '/api/auth/login',
    auth: 'Bearer t',
    body: '{"a":1}',
  });
  assert.equal(answer.status, 422);
  assert.equal(answer.headers['retry-after'], '5');
  assert.equal(answer.body, '{"error":{}}');
});

test('a request settles once on a timeout, and on an answer too large', async (t) => {
  const base = await loopback(t, (req, res) => {
    if (req.url === '/slow') {
      setTimeout(() => res.end('{}'), 500);
      return;
    }
    res.end('x'.repeat(5000));
  });
  await assert.rejects(httpRequest(`${base}/slow`, { timeout: 50 }), { kind: 'timeout' });
  await assert.rejects(httpRequest(`${base}/big`, { maxBytes: 1000 }), { kind: 'size' });
});

test('no answer is a network error with a short reason', async () => {
  await assert.rejects(httpRequest('http://127.0.0.1:1/'), (err) => {
    assert.equal(err.kind, 'network');
    assert.equal(err.message, 'connection refused');
    return true;
  });
  assert.equal(networkError({ code: 'ENOTFOUND' }).message, 'unknown host name');
  const known = new SurePetcareError('timeout', 'x');
  assert.equal(networkError(known), known);
});

test('the status codes map to error kinds', () => {
  const kind = (status, options) => errorFor({ status, headers: {} }, options).kind;
  for (const status of [400, 401, 422]) {
    assert.equal(kind(status, { login: true }), 'refused', `login ${status}`);
  }
  assert.equal(kind(401), 'unauthorized');
  assert.equal(kind(403), 'forbidden');
  assert.equal(kind(403, { login: true }), 'forbidden');
  assert.equal(kind(429), 'rate_limited');
  assert.equal(kind(503), 'unavailable');
  assert.equal(kind(404), 'http');
  const limited = errorFor({ status: 429, headers: { 'retry-after': '120' } });
  assert.equal(limited.retryAfter, 120_000);
  assert.equal(errorReason(limited), 'too many requests (HTTP 429)');
  assert.equal(errorReason(new Error('boom')), 'boom');
});

test('Retry-After in seconds or as a date', () => {
  const now = Date.UTC(2026, 9, 16, 8, 0, 0);
  assert.equal(parseRetryAfter('30', now), 30_000);
  assert.equal(parseRetryAfter(new Date(now + 90_000).toUTCString(), now), 90_000);
  assert.equal(parseRetryAfter(undefined, now), undefined);
  assert.equal(parseRetryAfter('soon', now), undefined);
});

test('answers are { data }', () => {
  assert.deepEqual(parseData('{"data":{"a":1}}'), { a: 1 });
  assert.throws(() => parseData('<html>'), { kind: 'bad_response' });
  assert.throws(() => parseData('{"error":1}'), { kind: 'bad_response' });
});

test('the expiry of a session token comes from its exp claim', () => {
  assert.equal(tokenExpiry(jwt({ exp: 1_800_000_000 })), 1_800_000_000_000);
  assert.equal(tokenExpiry(jwt({ sub: 1 })), undefined);
  assert.equal(tokenExpiry('not-a-jwt'), undefined);
  assert.equal(tokenExpiry('a.!!!.c'), undefined);
});
