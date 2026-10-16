// -----------------------------------------------------------------------------
// What must survive a restart, in /data (the only writable place of the
// container):
//   - the client id sent to Sure Petcare (one per installation, not one per
//     start: each new one is a new "device" of the account);
//   - the session token, with the account it belongs to (a hash of the
//     e-mail), so a restart does not sign in again;
//   - per flap, the curfew entries that were enabled before a lock mode
//     turned the curfew off, to turn the same ones back on.
// -----------------------------------------------------------------------------

import { readFile, rename, writeFile } from 'node:fs/promises';

export const STATE_FILE = '/data/surepetcare-state.json';

export function fileStore(path = STATE_FILE) {
  return {
    async load() {
      try {
        return JSON.parse(await readFile(path, 'utf8'));
      } catch {
        return null;
      }
    },
    async save(data) {
      const temporary = `${path}.tmp`;
      await writeFile(temporary, JSON.stringify(data), { mode: 0o600 });
      await rename(temporary, path);
    },
  };
}

/** The persisted state, repaired. */
export function normalizeMemory(raw) {
  const deviceId = typeof raw?.deviceId === 'string' && raw.deviceId !== '' ? raw.deviceId : null;
  const s = raw?.session;
  const session =
    s && typeof s.token === 'string' && s.token !== '' && typeof s.account === 'string'
      ? {
          account: s.account,
          token: s.token,
          expiresAt: Number.isFinite(s.expiresAt) ? s.expiresAt : undefined,
        }
      : null;
  const curfews = {};
  for (const [flapId, indexes] of Object.entries(raw?.curfews ?? {})) {
    if (Array.isArray(indexes) && indexes.every(Number.isInteger)) {
      curfews[flapId] = indexes;
    }
  }
  return { deviceId, session, curfews };
}
