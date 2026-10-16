// -----------------------------------------------------------------------------
// The only network access: HTTPS requests to the Sure Petcare cloud, and the
// errors they end with.
//
// The API is the one of the Sure Petcare app, undocumented. What is used here
// was read from the community clients: surepy (MIT, the library of the Home
// Assistant integration), ioBroker.sureflap (MIT) and node-red-contrib-
// surepetcare (MIT). Every answer is `{ data: … }`; a refused token is a 401.
// -----------------------------------------------------------------------------

import http from 'node:http';
import https from 'node:https';
import { LIMITS, TIMINGS } from './constants.js';

/**
 * A failed Sure Petcare call. `kind`:
 * - `no_credentials`: no e-mail or password in the configuration (never sent);
 * - `refused`: the sign-in was refused (wrong e-mail or password);
 * - `unauthorized`: the API refused the session token (401);
 * - `forbidden`: the API refused the request (403: a block, a foreign device);
 * - `rate_limited`: too many requests (429), `retryAfter` in ms when given;
 * - `unavailable`: Sure Petcare is down (5xx);
 * - `network`, `timeout`: no answer;
 * - `bad_response`, `size`: an answer that is not the expected JSON;
 * - `rejected`: a command the API answered without applying it;
 * - `http`: any other status.
 */
export class SurePetcareError extends Error {
  constructor(kind, message, { status, retryAfter } = {}) {
    super(message);
    this.name = 'SurePetcareError';
    this.kind = kind;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

const NETWORK_REASONS = {
  ECONNREFUSED: 'connection refused',
  ECONNRESET: 'connection reset',
  EHOSTUNREACH: 'host unreachable',
  ENETUNREACH: 'network unreachable',
  ENOTFOUND: 'unknown host name',
  EAI_AGAIN: 'host name not resolved',
  ETIMEDOUT: 'connection timed out',
  EPIPE: 'connection closed',
};

/** A socket error -> SurePetcareError (never the request: the sign-in carries the password). */
export function networkError(err) {
  if (err instanceof SurePetcareError) {
    return err;
  }
  const reason = NETWORK_REASONS[err?.code] ?? err?.code ?? 'network error';
  return new SurePetcareError('network', reason);
}

/** A short, secret-free reason for a log or a status message. */
export function errorReason(err) {
  if (err instanceof SurePetcareError) {
    return err.status ? `${err.message} (HTTP ${err.status})` : err.message;
  }
  return String(err?.message ?? err);
}

/**
 * One request; resolves `{ status, headers, body }` whatever the status. The
 * promise settles once: a request destroyed for its size or its timeout may
 * still end or fail after that.
 * @param {string} url
 * @param {{ method?: string, headers?: object, body?: string, timeout?: number, maxBytes?: number }} options
 */
export function httpRequest(
  url,
  {
    method = 'GET',
    headers = {},
    body,
    timeout = TIMINGS.requestTimeout,
    maxBytes = LIMITS.responseBytes,
  } = {},
) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const lib = target.protocol === 'https:' ? https : http;
    let timer;
    let settled = false;
    const settle = (fn, value) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        fn(value);
      }
    };
    const req = lib.request(target, { method, headers }, (res) => {
      const chunks = [];
      let size = 0;
      res.on('data', (chunk) => {
        size += chunk.length;
        if (size > maxBytes) {
          settle(reject, new SurePetcareError('size', 'answer too large'));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      res.on('end', () =>
        settle(resolve, {
          status: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks).toString('utf8'),
        }),
      );
      res.on('error', (err) => settle(reject, networkError(err)));
    });
    timer = setTimeout(() => {
      settle(
        reject,
        new SurePetcareError('timeout', `no answer within ${Math.round(timeout / 1000)} s`),
      );
      req.destroy();
    }, timeout);
    req.on('error', (err) => settle(reject, networkError(err)));
    req.end(body);
  });
}

/** Retry-After (seconds or an HTTP date) -> milliseconds, undefined when absent. */
export function parseRetryAfter(value, now = Date.now()) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const seconds = Number(value);
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - now);
}

/** The error of a non-2xx answer. `login`: the answer of the sign-in. */
export function errorFor({ status, headers = {} }, { login = false, now } = {}) {
  if (login && [400, 401, 422].includes(status)) {
    return new SurePetcareError('refused', 'e-mail or password refused', { status });
  }
  if (status === 401) {
    return new SurePetcareError('unauthorized', 'session refused', { status });
  }
  if (status === 403) {
    return new SurePetcareError('forbidden', 'request refused', { status });
  }
  if (status === 429) {
    return new SurePetcareError('rate_limited', 'too many requests', {
      status,
      retryAfter: parseRetryAfter(headers['retry-after'], now),
    });
  }
  if (status >= 500) {
    return new SurePetcareError('unavailable', 'Sure Petcare is unavailable', { status });
  }
  return new SurePetcareError('http', 'request failed', { status });
}

/** The `data` of a JSON answer. */
export function parseData(body) {
  let json;
  try {
    json = JSON.parse(body);
  } catch {
    throw new SurePetcareError('bad_response', 'Sure Petcare sent an answer that is not JSON');
  }
  if (!json || typeof json !== 'object' || !('data' in json)) {
    throw new SurePetcareError('bad_response', 'Sure Petcare sent an answer without data');
  }
  return json.data;
}

/** The expiry (ms since the epoch) of a JWT, from its `exp` claim; undefined when unreadable. */
export function tokenExpiry(token) {
  const payload = String(token ?? '').split('.')[1];
  if (!payload) {
    return undefined;
  }
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    const exp = Number(claims?.exp);
    return Number.isFinite(exp) && exp > 0 ? exp * 1000 : undefined;
  } catch {
    return undefined;
  }
}
