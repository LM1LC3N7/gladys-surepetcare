# gladys-surepetcare

[Gladys Assistant](https://gladysassistant.com) external integration for
**Sure Petcare**: SureFlap cat flaps and pet doors, SureFeed feeders and
Felaqua water stations, through the Sure Petcare cloud (the one of the app).
Each pet inside or outside and since when, the lock mode of the flaps
(unlocked, keep in, keep out, locked, curfew) settable from Gladys, the bowl
weights and the last meal of the feeders, the water left in the Felaqua,
batteries and online states, and scene triggers when a pet goes out, comes in
or eats. Unofficial, not affiliated with Sure Petcare.

User documentation: [docs/en.md](docs/en.md) · [docs/fr.md](docs/fr.md).

> Work in progress (0.1, not published to the store yet): announced on the
> [Gladys forum](https://community.gladysassistant.com/t/integrations-home-assistant-les-plus-populaires-candidates-pour-des-integrations-externes-gladys/10385/178).

## How it works

```
Gladys ⇄ SDK ⇄ src/handlers.js ⇄ src/app.js (SurePetcareApp) ⇄ src/client.js ⇄ src/surepetcare.js ⇄ app-api.production.surehub.io
                                   ├─ src/inventory.js  me/start -> households, devices, pets (pure)
                                   ├─ src/devices.js    -> Gladys devices and states (pure)
                                   ├─ src/events.js     two readings -> scene events (pure)
                                   ├─ src/publisher.js  300 states/min, dated states and scene events queued
                                   └─ src/store.js      client id, session, curfew memory (/data)
```

- **Account**: e-mail and password of the Sure Petcare app (`secret` field).
  `POST /api/auth/login` with `email_address`, `password` and a `device_id`
  (a client id made once and kept in `/data`) returns a JWT. It is reused
  across restarts, renewed an hour before its `exp`, and once when the API
  answers 401. A refused sign-in is never retried by itself (it waits for a
  configuration change or the "Test the connection" button); the status
  shows the session expiry.
- **Reading**: one `GET /api/me/start` per poll (60 s by default, 30 to 600)
  returns the households, devices with their status and control, and pets
  with their position and last meal and drink. Errors back off 1, 2, 5, 10
  then 15 minutes; a 429 waits for `Retry-After` (15 minutes otherwise).
- **Devices**: `ext:<selector>:device:<Sure id>` for the hub, flaps, feeders
  and Felaqua, `ext:<selector>:pet:<Sure id>` for the pets. Repeaters and
  programmers are skipped.
- **Lock mode**: a `text`/`select` feature (`unlocked`, `keep_in`,
  `keep_out`, `locked`, `curfew`). Modes 0–3 are `PUT /api/device/<id>/control
{"locking": n}`; the curfew is its own control setting (`control.curfew`,
  an array on the cat flap, one object on the pet door): "curfew" enables
  its times, another mode disables it first and remembers which entries were
  on.
- **States**: current values through `publishChangedStates`; moves and meals
  dated with their time through `publishStates`, once each. Scene events
  (`pet_went_out`, `pet_came_in`, `pet_ate`) are queued and all sent; the
  first reading and changes older than 15 minutes are not fired.

## Development

```bash
npm install
npm test                                        # node --test, no network
npm run lint && npm run format:check
npm run audit
npx github:GladysAssistant/integration-store .  # store admission checks
```

`test/fixtures/surepetcare.js` holds me/start answers shaped like the
community clients read them (made-up values); `test/helpers/fakeSurePetcare.js`
serves them behind the transport, sign-in and control included. The
transport itself is tested against a loopback HTTP server.

## Credits

No maintained JavaScript library of the Sure Petcare API exists (see
[TODO.md](TODO.md), Decisions): the client is our own, written from the
behaviour documented by these projects, read as documentation (no code
copied):

- [surepy](https://github.com/benleb/surepy) (MIT), the library of the Home
  Assistant `surepetcare` integration: endpoints, lock states, product ids,
  feeding and drinking states;
- the Home Assistant [`surepetcare`](https://github.com/home-assistant/core/tree/dev/homeassistant/components/surepetcare)
  integration (Apache-2.0): battery voltages, polling pace, test answers;
- [ioBroker.sureflap](https://github.com/Sickboy78/ioBroker.sureflap) (MIT):
  `bowl_status`, `battery_percentage`, the curfew of each flap type;
- [node-red-contrib-surepetcare](https://github.com/dirkjanfaber/node-red-contrib-surepetcare)
  (MIT): lock state values around the curfew.

## Releasing

**Actions → Release → Run workflow** (patch / minor / major): bumps the
version in `package.json` and the manifest, rolls `CHANGELOG.md`, tags, builds
the multi-arch image to GHCR and publishes the GitHub Release. The
`gladys-assistant-integration` topic is added at the first real release only.

## License

Apache-2.0. Sure Petcare, SureFlap, SureFeed and Felaqua are trademarks of
their owner; this project is not affiliated with Sure Petcare.
