# TODO — Sure Petcare v1

Handoff document: what is done, what was decided, what comes next. Keep it
up to date at the end of every milestone.

## Working method

- One milestone at a time, one commit per milestone, tests green before moving on.
- After each milestone: `npm run format:check`, `npm run lint`, `npm test`,
  `npm run audit`, then update README, `docs/en.md`, `docs/fr.md`,
  `CHANGELOG.md` and this file.
- The `gladys-assistant-integration` topic is added at the first real release
  only (before, the store would list an empty integration).
- No forum topic of its own, ever, and no forum post from a module session:
  the batch claimed in /t/10385 (post #178) gets one recap message there, with
  a link to each repo, once the ten are published.

## Status

- [x] **Milestone 1 — core** (2026-10-16): sign-in with e-mail and password
      (JWT, client id kept in `/data`, session reused across restarts, renewed
      an hour before `exp` and once on 401, expiry in the status, refused
      sign-in never retried by itself), one `me/start` per poll (60 s, 30–600),
      backoff and 429 pause; devices for the hub (online), cat flaps and pet
      doors (lock mode select, battery, online), feeders (bowl weights, last
      meal and its pet, battery, online), Felaqua (water left, level, battery,
      online), pets (presence dated with `position.since`, minutes since the
      move, last meal, last drink); lock mode commands with the curfew
      handled as its own setting; scene triggers `pet_went_out`,
      `pet_came_in`, `pet_ate`; badges; "Test the connection"; en/fr names;
      docs en/fr. Tested against made-up answers only.
- [ ] **Milestone 2 — real account**: run against a real account and compare
      with the app (see "To check on a real account"); turn the answers
      (anonymized) into fixtures; add the fallbacks real answers need
      (below).
- [ ] **Milestone 3 — more**: per-pet indoor/outdoor profile on a flap
      (`PUT /device/<id>/tag/<tag>` `{ profile: 2|3 }`, surepy 0.10) as a
      select per pet and flap; set a pet inside/outside from Gladys
      (`POST /pet/<id>/position`); curfew times editable (scene action);
      daily food and water totals (`/report/household/<id>/pet/<id>/aggregate`);
      hub LED mode; feeder lid close delay; repeaters as online-only devices.
- [ ] **Milestone 4 — first release**: cover image, Docker image build check,
      `npx github:GladysAssistant/integration-store .`, Release workflow,
      topic, GHCR package public.

## To check on a real account

- The `me/start` answer: are `households`, `devices[].status.bowl_status`,
  `status.battery_percentage` and `pets[].status.feeding/drinking` there (the
  community clients read some of them from `/device` and `/report`)? If the
  bowls have no `bowl_status`, read the last feeding datapoint of
  `/report/household/<id>` (surepy `get_actions`) for the weights, and the
  household timeline (types 29, 30, 34) for the Felaqua (surepy
  `get_latest_anonymous_drinks`).
- The JWT: its `exp` (lifetime), and whether the sign-in answer of an account
  with two-factor or a locked account differs from a plain 401.
- `PUT /device/<id>/control` answers: does `{ "locking": n }` answer the new
  `locking` at once (surepy expects it), or only after the hub applied it?
  Does `{ "curfew": … }` need `/control/async` (ioBroker uses it)?
- The curfew of a cat flap with its curfew enabled: which `locking.mode` does
  the API report (0, 4, -1/-2)? Does choosing a lock mode in the app turn the
  curfew off (what the integration does)?
- The pet door (product 3): `control.curfew` one object, `locking.mode` 4 in
  curfew?
- `position.since` with or without offset, `position.user_id` for a change
  made in the app, `status.feeding.change` signs (negative = eaten).
- Rate limits: none documented; watch for 429 and `Retry-After`.

## Decisions

- **Not a duplicate** (checked 2026-10-16): the Gladys core master (165e0d9,
  after 5.2.1) has no Sure Petcare service (`server/services/*`: airplay …
  zwavejs-ui, no surepetcare/sureflap/surehub anywhere in the repository) and
  the release notes mention none; Sure Petcare devices are not Matter. The
  store index (405 entries, generated 2026-10-16T05:47Z) has no Sure Petcare
  integration: the pet ones are guim31/gladys-litter-robot (Whisker litter
  boxes) and guim31/gladys-tractive (GPS trackers), other products. The
  tracker entry n° 249 "Sure Petcare" lists only this repository.
- **Own client, no dependency** (Louis's rule: reuse maintained work, rewrite
  dead or debt-heavy code). The candidates, 2026-10-16:
  - `node-surepetcare` (npm 0.2.88, 2025-08, MIT): last release 14 months
    ago, builds the sign-in JSON by string concatenation (a password with a
    quote breaks it), throws strings, pulls `node-fetch` and `node-cron` (its
    own scheduler). Not used.
  - `sure_petcare` / `@francoisdebellescize/sure_petcare` (2020, 2023, the
    deprecated `request`), `sure-pet-care-client` (2020): dead.
  - `node-red-contrib-surepetcare` (0.6.3, 2026-09, MIT, active), its sibling
    `mcp-server-surepetcare`, `homebridge-sureflap` (2026-09),
    `homebridge-petsure` and `iobroker.sureflap` (3.4.4, 2026-09, MIT, the most
    complete): maintained, but plugins of their platform with their client
    inside (axios, adapter-core), not libraries.
  - `surepy` (Python, 0.10.0 of 2026-10-10, MIT, the library of Home
    Assistant): the reference, used as protocol documentation.
    The API needs three calls (sign-in, `me/start`, control): ~350 lines on
    `node:https`, written from surepy, the Home Assistant integration,
    ioBroker.sureflap and node-red-contrib-surepetcare (read, nothing copied;
    credited in the README). Runtime dependencies: the SDK only.
- **Host `app-api.production.surehub.io`**: `app.api.surehub.io` (surepy, Home
  Assistant, Homebridge, Node-RED) is a DNS alias of it (same addresses,
  same nginx, probe 2026-10-16); ioBroker already uses the production name.
  The sign-in validator asks for `email_address`, `password` and a client id
  (`device_id` or `client_uid`, unauthenticated probe without credentials).
- **Client id made once** (a UUID in `/data`): surepy makes a new one at each
  start, ioBroker a fixed one for all users. One per installation keeps the
  account from collecting a new "device" at each restart.
- **Session**: the JWT is kept in `/data` with a hash of the e-mail (a new
  e-mail never reuses it), renewed an hour before its `exp` (unknown
  lifetime: Node-RED assumes 24 h), and once on a 401 (surepy 0.10 does the
  same). Its end date is in the connection status. A refused sign-in stops
  the polling until the configuration changes or the test button is clicked:
  the Toshiba lesson (two refused logins may lock an account for hours).
- **One `me/start` per poll, 60 s by default**: the bundle has everything
  (households, devices with status and control, pets with position and
  status). No quota is documented; Home Assistant reads every 3 min, openHAB
  every 5, Homebridge every 30 s (5 s minimum), ioBroker every 10 s. 30 s
  minimum here.
- **Lock mode = `text`/`select`** with string values (`unlocked`, `keep_in`,
  `keep_out`, `locked`, `curfew`): Gladys has no five-state lock, and the
  `lock` category is binary. `locking.mode` 0–3 map one to one; 4 and the
  negative values (-1 curfew locked, -2 unlocked, -3 unknown, surepy) and any
  enabled curfew entry read as `curfew`.
- **Curfew as its own setting** (ioBroker): "curfew" PUTs `control.curfew`
  with its timed entries enabled (an array on the cat flap, one object on the
  pet door); another mode PUTs the curfew disabled first, then `locking`, and
  remembers in `/data` which entries were on, to enable the same ones next
  time. No curfew times on the flap: the command fails with a message (set
  them once in the app). A mode just set wins over the readings for 2 minutes
  (the hub applies it in a few seconds), and a read follows 10 s after the
  command; the next command starts from what was sent.
- **Online = `input`/`binary`** (On/Off badge in Gladys) plus the transport
  badge (unreachable and degraded, with a message, when the hub reports the
  device offline): the core has no connectivity category (its Home Assistant
  mapping leaves `connectivity` out on purpose).
- **Presence = `presence-sensor`/`binary`** (1 inside), dated with
  `position.since` and sent once per move (the front shows Yes/No for a
  binary presence since 4.86). "Since when" is that date, plus a `duration`
  feature in minutes for scene conditions ("out for more than 6 h").
- **Grams without unit**: Gladys has no mass unit; the bowls and meals are
  `unknown`/`unknown` with "(g)" in their names. The water is a
  `volume-sensor` in mL (the Felaqua weighs the water: 1 g = 1 mL), its level
  a `level-sensor`/`liquid-level-percent`.
- **Battery**: `battery_percentage` when the API gives it, else the Home
  Assistant formula on four AA cells (1.25 V empty, 1.6 V full).
- **Events**: from two readings of a pet; the first reading and anything
  older than 15 minutes when first seen are history (logged, not fired). Two
  moves between two readings are one (the last). A meal under 1 g is a visit
  (the app does not count it either). A change made in the app fires too,
  with `by_hand: true` and no flap. Scene events are queued (300/min) and all
  sent; a key or data Gladys refuses is dropped, an unreachable Gladys keeps
  them.
- **Repeaters (2) and programmers (5)** are skipped (surepy does the same),
  logged once.
