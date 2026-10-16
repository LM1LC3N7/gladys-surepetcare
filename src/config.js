// -----------------------------------------------------------------------------
// The configuration of the manifest `config_schema`, normalized.
// -----------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import { POLL_INTERVAL } from './constants.js';

/** Defaults, mirrored by the manifest (checked by test/manifest.test.js). */
export const DEFAULTS = {
  poll_interval: POLL_INTERVAL.default,
  language: 'fr',
};

export const LANGUAGES = ['fr', 'en'];

/** The account a session belongs to, without keeping the e-mail itself. */
export const accountKey = (email) =>
  createHash('sha256').update(email.trim().toLowerCase()).digest('hex').slice(0, 16);

export function normalizeConfig(raw = {}) {
  const email = String(raw?.email ?? '').trim();
  const password = String(raw?.password ?? '');
  const interval = Number(raw?.poll_interval);
  const language = String(raw?.language ?? DEFAULTS.language)
    .trim()
    .toLowerCase();
  return {
    email,
    password,
    account: email === '' ? '' : accountKey(email),
    pollInterval: Number.isFinite(interval)
      ? Math.round(Math.max(POLL_INTERVAL.min, Math.min(POLL_INTERVAL.max, interval)))
      : DEFAULTS.poll_interval,
    language: LANGUAGES.includes(language) ? language : DEFAULTS.language,
  };
}
