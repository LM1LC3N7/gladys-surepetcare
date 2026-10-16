# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for
human contributors. Read **[TODO.md](./TODO.md) first**: status, decisions
already taken and the next milestones.

## What this is

A Gladys Assistant **external integration** of type `device`: a Node.js
service (Node 22+, ESM, no build step) in its own sandboxed Docker container,
talking to Gladys through `@gladysassistant/integration-sdk` (v0.15), its only
runtime dependency (HTTPS goes through `node:https`). It signs in to the Sure
Petcare cloud with the e-mail and password of the app, reads the households,
devices (hub, SureFlap flaps, SureFeed feeders, Felaqua) and pets once per
poll, turns them into Gladys devices and states, sets the lock mode of the
flaps, and fires scene events when a pet goes out, comes in or eats.
Unofficial, not affiliated with Sure Petcare.

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
node --test test/app.test.js              # one file
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npm run audit                             # npm audit --omit=dev
npx github:GladysAssistant/integration-store .   # store admission checks
```

Run `format:check`, `lint`, `test` and `audit` before every commit.

## Architecture

```
index.js            SDK bootstrap only
src/handlers.js     every SDK handler -> the app (shared with the tests)
src/app.js          SurePetcareApp: poll loop, failures and pauses, devices,
                    states, scene events, lock mode commands, badges,
                    "Test the connection"
src/client.js       the account: session (JWT exp, one retry on 401), the 3 calls
src/surepetcare.js  the only network access (node:https, settles once), errors
src/inventory.js    me/start -> households, devices, pets (pure)
src/devices.js      -> Gladys devices, current and dated states (pure)
src/events.js       two readings of a pet -> scene events (pure)
src/publisher.js    states within 300/min, dated states and scene events queued
src/store.js        /data/surepetcare-state.json: client id, session, curfews
src/config.js       config_schema normalized, account key (hash of the e-mail)
src/constants.js    API host and paths, product ids, manifest keys, limits, timings
src/i18n.js         runtime texts, device, feature and lock mode names (en/fr)
test/fixtures/      me/start answers shaped like the community clients read them
test/helpers/       a fake Sure Petcare behind the transport; Gladys is the SDK's fake
```

## Rules

- **External ids are forever**: device = `device:<Sure id>` or `pet:<Sure id>`,
  feature = `<device>:<role>` (`online`, `battery`, `lock-mode`, `bowl-0`,
  `bowl-1`, `last-meal`, `last-meal-pet`, `water`, `water-level`, `presence`,
  `location-duration`, `last-drink`). Never change how they are built.
- Manifest keys (`email`, `password`, `poll_interval`, `language`,
  `test_connection`, the three scene triggers and their fields/variables) and
  the lock mode values (`unlocked`, `keep_in`, `keep_out`, `locked`,
  `curfew`) are frozen: users store them in devices and scenes.
- Value conventions: the Sure side is the API's (`locking.mode` 0–4 and the
  negative curfew states, `where` 1 inside / 2 outside, curfew times in UTC);
  the Gladys side the enums of the core `server/utils/constants.js`
  (presence 1 = present, binary 1 = on). The SDK exports the categories,
  types and units, not the values: they are in `src/constants.js`.
- Gladys has no mass unit: grams are `unknown`/`unknown` with "(g)" in the
  name. Never send a unit Gladys does not know: the whole list is refused.
- Moves and meals are dated states (`publisher.pushEvent`, publishStates),
  sent once per key; scene events go through `publisher.pushSceneEvent` and
  are never deduplicated. Never fire an event from a command received from
  Gladys (scene loops).
- **Never sign in again by itself after a refused sign-in** (repeated refusals
  can lock the account): only a configuration change or the test button
  retries. Never log or put in a status message the password or the token.
- Polling politely: one `me/start` per poll, 30 s minimum. Never add a call
  outside `SurePetcareClient`.
- Container limits: 256 MB RAM, 0.5 CPU, read-only rootfs, only `/data`
  writable, bridge network. Gladys rate limits: 300 states/min, 300 scene
  events/min.
- Tests never touch the network: the transport is injected
  (`test/surepetcare.test.js` uses a loopback server for the real one).
- Code, comments, README in English; `docs/en.md` and `docs/fr.md` kept in sync.
- Every user-visible change adds a line under `## [Unreleased]` in
  `CHANGELOG.md`; versions belong to the Release workflow.
