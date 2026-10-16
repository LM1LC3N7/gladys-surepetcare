// -----------------------------------------------------------------------------
// Answers of the Sure Petcare API, shaped like the community clients read
// them: the entities of surepy (MIT), the mocks of the Home Assistant
// `surepetcare` tests (Apache-2.0) and the field paths of ioBroker.sureflap
// (MIT, `bowl_status`, `battery_percentage`, curfew arrays and objects). The
// values are made up; no answer of a real account is copied.
// -----------------------------------------------------------------------------

export const NOW = Date.UTC(2026, 9, 16, 8, 0, 0);
export const MINUTE = 60_000;
export const DAY = 24 * 60 * MINUTE;

export const EMAIL = 'chat@example.com';
export const PASSWORD = 'p@ss "word" \\ ü';

export const HOUSEHOLD = 1001;
export const HUB = 2001;
export const CAT_FLAP = 2002;
export const PET_DOOR = 2003;
export const FEEDER = 2004;
export const FELAQUA = 2005;
export const REPEATER = 2006;
export const FELIX = 3001;
export const NALA = 3002;
export const TOM = 3003;

const iso = (ms) => new Date(ms).toISOString().replace('.000Z', '+00:00');

/** An unsigned JWT with the claims given (the integration only reads `exp`). */
export function jwt(claims) {
  const part = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${part({ typ: 'JWT', alg: 'HS256' })}.${part(claims)}.c2lnbmF0dXJl`;
}

/** A fresh me/start `data`, as of NOW. */
export function meStart() {
  return {
    user: { id: 4001, first_name: 'Camille' },
    households: [{ id: HOUSEHOLD, name: 'Maison', timezone_id: 299 }],
    devices: [
      {
        id: HUB,
        product_id: 1,
        household_id: HOUSEHOLD,
        name: 'Hub',
        serial_number: 'H010-0123456',
        status: {
          led_mode: 4,
          pairing_mode: 0,
          online: true,
          version: { device: { firmware: 2.201 } },
        },
      },
      {
        id: CAT_FLAP,
        product_id: 6,
        household_id: HOUSEHOLD,
        parent_device_id: HUB,
        name: 'Chatière cuisine',
        serial_number: 'C010-1111111',
        status: {
          battery: 5.6,
          locking: { mode: 1 },
          learn_mode: false,
          online: true,
          signal: { device_rssi: -71.5, hub_rssi: -68 },
        },
        control: {
          curfew: [
            { enabled: false, lock_time: '19:00', unlock_time: '07:00' },
            { enabled: false, lock_time: '12:00', unlock_time: '13:00' },
          ],
          locking: 1,
          fast_polling: false,
        },
      },
      {
        id: PET_DOOR,
        product_id: 3,
        household_id: HOUSEHOLD,
        parent: { product_id: 1, id: HUB },
        name: 'Porte garage',
        status: {
          battery: 6.1,
          battery_percentage: 87,
          locking: { mode: 4 },
          online: false,
        },
        control: { curfew: { enabled: true, lock_time: '21:30', unlock_time: '06:30' } },
      },
      {
        id: FEEDER,
        product_id: 4,
        household_id: HOUSEHOLD,
        parent_device_id: HUB,
        name: 'Distributeur',
        status: {
          battery: 5.9,
          online: true,
          bowl_status: [
            { index: 0, current_weight: 32.4, fill_percent: 65, last_filled_at: iso(NOW - DAY) },
            { index: 1, current_weight: 18, fill_percent: 36, last_filled_at: iso(NOW - DAY) },
          ],
        },
        control: {
          lid: { close_delay: 4 },
          bowls: {
            type: 4,
            settings: [
              { food_type: 1, target: 50 },
              { food_type: 2, target: 50 },
            ],
          },
        },
      },
      {
        id: FELAQUA,
        product_id: 8,
        household_id: HOUSEHOLD,
        parent_device_id: HUB,
        name: 'Fontaine',
        status: {
          battery: 5.8,
          battery_percentage: 64,
          online: true,
          bowl_status: [{ index: 0, current_weight: 412.6, fill_percent: 41 }],
        },
      },
      {
        id: REPEATER,
        product_id: 2,
        household_id: HOUSEHOLD,
        name: 'Répéteur',
        status: { online: true },
      },
    ],
    pets: [
      {
        id: FELIX,
        household_id: HOUSEHOLD,
        name: 'Felix',
        tag_id: 5001,
        position: { tag_id: 5001, device_id: CAT_FLAP, where: 1, since: iso(NOW - 18 * MINUTE) },
        status: {
          activity: { tag_id: 5001, device_id: CAT_FLAP, where: 1, since: iso(NOW - 18 * MINUTE) },
          feeding: {
            tag_id: 5001,
            device_id: FEEDER,
            change: [-6.2, -3.4],
            at: iso(NOW - 30 * MINUTE),
          },
          drinking: {
            tag_id: 5001,
            device_id: FELAQUA,
            change: [-14.4],
            at: iso(NOW - 25 * MINUTE),
          },
        },
      },
      {
        id: NALA,
        household_id: HOUSEHOLD,
        name: 'Nala',
        tag_id: 5002,
        position: { tag_id: 5002, device_id: PET_DOOR, where: 2, since: iso(NOW - 110 * MINUTE) },
        status: {},
      },
      {
        id: TOM,
        household_id: HOUSEHOLD,
        name: 'Tom',
        // Set by hand in the app; a date without offset, as some answers have.
        position: { tag_id: 5003, user_id: 4001, where: 1, since: '2026-10-15T22:00:00' },
      },
    ],
  };
}
