// -----------------------------------------------------------------------------
// The answer of GET /me/start -> the households, devices and pets the
// integration works with (pure).
//
// Field paths, cross-checked with surepy (MIT) and ioBroker.sureflap (MIT):
//   device.status.online, .battery (volts, four AA cells),
//     .battery_percentage (recent firmware), .locking.mode,
//     .bowl_status[i].current_weight / .fill_percent (feeders, Felaqua);
//   device.control.curfew (an array on the cat flap, one object on the pet
//     flap, times in UTC), .bowls.type (1: one big bowl) and .bowls.settings;
//   pet.position.where (1 inside, 2 outside), .since, .device_id, .user_id;
//   pet.status.feeding / .drinking: .at, .change (grams per bowl), .device_id.
// -----------------------------------------------------------------------------

import { BATTERY_VOLTAGE, LOCKING, PRODUCTS, WHERE } from './constants.js';

const KINDS = {
  [PRODUCTS.HUB]: 'hub',
  [PRODUCTS.PET_FLAP]: 'flap',
  [PRODUCTS.CAT_FLAP]: 'flap',
  [PRODUCTS.FEEDER]: 'feeder',
  [PRODUCTS.FEEDER_LITE]: 'feeder',
  [PRODUCTS.FELAQUA]: 'felaqua',
};

const list = (value) => (Array.isArray(value) ? value : []);
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const idOf = (value) =>
  value === undefined || value === null || value === '' ? null : String(value);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** A finite number, or undefined (null and '' are not 0). */
export function numberOf(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

/** An API date ("2026-10-16T07:12:33+00:00", sometimes without offset: UTC) -> ms. */
export function timeOf(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    return undefined;
  }
  const text = value.trim().replace(' ', 'T');
  const zoned = /(Z|[+-]\d{2}:?\d{2})$/i.test(text) ? text : `${text}Z`;
  const ms = Date.parse(zoned);
  return Number.isNaN(ms) ? undefined : ms;
}

/** Battery level in %: the API's own when given, else from the voltage of the four cells. */
export function batteryOf(status) {
  const percent = numberOf(status?.battery_percentage);
  if (percent !== undefined) {
    return Math.round(clamp(percent, 0, 100));
  }
  const volts = numberOf(status?.battery);
  if (volts === undefined || volts <= 0) {
    return undefined;
  }
  const { full, low, cells } = BATTERY_VOLTAGE;
  return clamp(Math.floor(((volts / cells - low) / (full - low)) * 100), 0, 100);
}

/** The curfew entries of a flap, as the API holds them (array or one object). */
export function curfewOf(device) {
  const curfew = device?.control?.curfew;
  if (Array.isArray(curfew)) {
    return { shape: 'array', entries: curfew.filter(isObject) };
  }
  if (isObject(curfew)) {
    return { shape: 'object', entries: [curfew] };
  }
  return { shape: device?.product_id === PRODUCTS.PET_FLAP ? 'object' : 'array', entries: [] };
}

export const hasTimes = (entry) =>
  typeof entry?.lock_time === 'string' && typeof entry?.unlock_time === 'string';

/**
 * The lock mode of a flap: an enabled curfew wins (the API may still say 0
 * then), and the curfew states of `locking.mode` (4, -1, -2, -3) are the
 * curfew too.
 */
export function lockModeOf(device) {
  if (curfewOf(device).entries.some((e) => e.enabled === true && hasTimes(e))) {
    return 'curfew';
  }
  const mode = numberOf(device?.status?.locking?.mode);
  if (mode === undefined) {
    return undefined;
  }
  if (mode === LOCKING.CURFEW || mode < 0) {
    return 'curfew';
  }
  return { 0: 'unlocked', 1: 'keep_in', 2: 'keep_out', 3: 'locked' }[mode];
}

/** The number of bowls of a feeder: one big bowl (type 1), else the halves known. */
export function bowlCountOf(device) {
  const bowls = device?.control?.bowls;
  if (numberOf(bowls?.type) === 1) {
    return 1;
  }
  const known = Math.max(list(bowls?.settings).length, list(device?.status?.bowl_status).length);
  return clamp(known, 0, 2);
}

/** The weights of the bowls of a feeder, or of the water of a Felaqua, in grams. */
function bowlsOf(device, count) {
  const status = list(device?.status?.bowl_status);
  return Array.from({ length: count }, (_, index) => {
    const entry = isObject(status[index]) ? status[index] : {};
    const weight = numberOf(entry.current_weight);
    const percent = numberOf(entry.fill_percent);
    return {
      index,
      weight: weight === undefined ? undefined : Math.max(0, weight),
      percent: percent === undefined ? undefined : clamp(percent, 0, 100),
    };
  });
}

/** Grams eaten (or millilitres drunk): the decreases of the bowls, summed. */
export function consumedOf(changes) {
  const total = list(changes)
    .map(numberOf)
    .filter((c) => c !== undefined && c < 0)
    .reduce((sum, c) => sum - c, 0);
  return Math.round(total * 10) / 10;
}

function activityOf(raw) {
  if (!isObject(raw)) {
    return undefined;
  }
  const at = timeOf(raw.at);
  if (at === undefined) {
    return undefined;
  }
  return { at, amount: consumedOf(raw.change), deviceId: idOf(raw.device_id) };
}

function readDevice(raw) {
  const productId = numberOf(raw.product_id);
  const kind = KINDS[productId];
  const status = isObject(raw.status) ? raw.status : {};
  const device = {
    id: String(raw.id),
    productId,
    kind,
    householdId: idOf(raw.household_id),
    parentId: idOf(raw.parent_device_id ?? raw.parent?.id),
    name: String(raw.name ?? '').trim(),
    serial: idOf(raw.serial_number),
    online: typeof status.online === 'boolean' ? status.online : undefined,
    battery: kind === 'hub' ? undefined : batteryOf(status),
  };
  if (kind === 'flap') {
    const curfew = curfewOf(raw);
    device.lockMode = lockModeOf(raw);
    device.curfew = curfew;
  } else if (kind === 'feeder') {
    device.bowls = bowlsOf(raw, bowlCountOf(raw));
  } else if (kind === 'felaqua') {
    device.water = bowlsOf(raw, 1)[0];
  }
  return device;
}

function readPet(raw) {
  const position = isObject(raw.position) ? raw.position : {};
  const where = numberOf(position.where);
  const status = isObject(raw.status) ? raw.status : {};
  return {
    id: String(raw.id),
    householdId: idOf(raw.household_id),
    name: String(raw.name ?? '').trim(),
    where: where === WHERE.INSIDE || where === WHERE.OUTSIDE ? where : undefined,
    since: timeOf(position.since),
    flapId: idOf(position.device_id),
    // Set by hand in the app: a user, no flap.
    byHand: idOf(position.device_id) === null && idOf(position.user_id) !== null,
    feeding: activityOf(status.feeding),
    drinking: activityOf(status.drinking),
  };
}

/**
 * The account of a me/start answer.
 * @returns {{ households: Map<string, { id: string, name: string }>, devices: object[], pets: object[], skipped: object[] }}
 */
export function readAccount(data) {
  const households = new Map();
  for (const raw of list(data?.households)) {
    if (isObject(raw) && idOf(raw.id) !== null) {
      households.set(String(raw.id), { id: String(raw.id), name: String(raw.name ?? '').trim() });
    }
  }
  const devices = [];
  const skipped = [];
  for (const raw of list(data?.devices)) {
    if (!isObject(raw) || idOf(raw.id) === null) {
      continue;
    }
    const device = readDevice(raw);
    (device.kind ? devices : skipped).push(device);
  }
  const pets = list(data?.pets)
    .filter((raw) => isObject(raw) && idOf(raw.id) !== null)
    .map(readPet);
  for (const entity of [...devices, ...pets]) {
    if (entity.householdId !== null && !households.has(entity.householdId)) {
      households.set(entity.householdId, { id: entity.householdId, name: '' });
    }
  }
  return { households, devices, pets, skipped };
}

/** The latest meal on a feeder, among the pets of the account. */
export function lastMealOf(feeder, pets) {
  let last;
  for (const pet of pets) {
    const meal = pet.feeding;
    if (meal && meal.deviceId === feeder.id && (!last || meal.at > last.at)) {
      last = { ...meal, petId: pet.id, petName: pet.name };
    }
  }
  return last;
}
