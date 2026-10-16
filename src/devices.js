// -----------------------------------------------------------------------------
// The account -> Gladys devices, and their states (pure).
//
// One device per Sure Petcare device (hub, pet door, cat flap, feeder,
// Felaqua), `ext:<selector>:device:<Sure id>`, and one per pet,
// `ext:<selector>:pet:<Sure id>`. Gladys has no mass unit: the grams are
// generic sensors with "(g)" in their name.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as C,
  DEVICE_FEATURE_TYPES as T,
  DEVICE_FEATURE_UNITS as U,
} from '@gladysassistant/integration-sdk';
import { GLADYS, LOCK_MODES, WHERE } from './constants.js';
import { FEATURE_NAMES, LOCK_MODE_NAMES, PRODUCT_NAMES, word } from './i18n.js';
import { lastMealOf } from './inventory.js';

const grams = { category: C.UNKNOWN, type: T.UNKNOWN.UNKNOWN, min: 0, max: 1000 };

/** The features, by role (the last part of their external id). */
export const FEATURES = {
  online: { category: C.INPUT, type: T.INPUT.BINARY, min: 0, max: 1 },
  battery: { category: C.BATTERY, type: T.BATTERY.INTEGER, unit: U.PERCENT, min: 0, max: 100 },
  'lock-mode': {
    category: C.TEXT,
    type: T.TEXT.SELECT,
    min: 0,
    max: 0,
    read_only: false,
    has_feedback: true,
    keep_history: false,
  },
  bowl: grams,
  'last-meal': grams,
  'last-meal-pet': { category: C.TEXT, type: T.TEXT.TEXT, min: 0, max: 0, keep_history: false },
  water: {
    category: C.VOLUME_SENSOR,
    type: T.VOLUME_SENSOR.INTEGER,
    unit: U.MILLILITER,
    min: 0,
    max: 5000,
  },
  'water-level': {
    category: C.LEVEL_SENSOR,
    type: T.LEVEL_SENSOR.LIQUID_LEVEL_PERCENT,
    unit: U.PERCENT,
    min: 0,
    max: 100,
  },
  presence: { category: C.PRESENCE_SENSOR, type: T.SENSOR.BINARY, min: 0, max: 1 },
  'location-duration': {
    category: C.DURATION,
    type: T.DURATION.INTEGER,
    unit: U.MINUTES,
    min: 0,
    max: 525600,
    keep_history: false,
  },
  'last-drink': {
    category: C.VOLUME_SENSOR,
    type: T.VOLUME_SENSOR.INTEGER,
    unit: U.MILLILITER,
    min: 0,
    max: 1000,
  },
};

export const deviceIds = (gladys, id) => gladys.externalIds('device', String(id));
export const petIds = (gladys, id) => gladys.externalIds('pet', String(id));

/** The role of a feature external id, and the kind and Sure id of its device. */
export function parseFeatureId(externalId) {
  const match = /:(device|pet):([^:]+):([^:]+)$/.exec(String(externalId ?? ''));
  return match ? { kind: match[1], id: match[2], role: match[3] } : undefined;
}

export const deviceName = (device, language) =>
  device.name ||
  `${word(PRODUCT_NAMES[device.productId] ?? PRODUCT_NAMES[1], language)} ${device.serial ?? device.id}`;

export const petName = (pet, language) =>
  pet.name || `${word(PRODUCT_NAMES.pet, language)} ${pet.id}`;

const bowlKey = (count, index) => (count === 1 ? 'bowl-single' : `bowl-${index}`);

function feature(ids, role, language, { nameKey = role, kind = role, ...extra } = {}) {
  return {
    name: word(FEATURE_NAMES[nameKey], language),
    external_id: ids.feature(role),
    read_only: true,
    has_feedback: false,
    keep_history: true,
    ...FEATURES[kind],
    ...extra,
  };
}

function lockOptions(language) {
  return LOCK_MODES.map((value) => ({ value, label: word(LOCK_MODE_NAMES[value], language) }));
}

function params(entries) {
  return entries
    .filter(([, value]) => value !== undefined && value !== null && String(value) !== '')
    .map(([name, value]) => ({ name, value: String(value) }));
}

function deviceFeatures(ids, device, language) {
  const features = [];
  if (device.kind === 'flap') {
    features.push(
      feature(ids, 'lock-mode', language, { supported_options: lockOptions(language) }),
    );
  }
  if (device.kind === 'feeder') {
    const count = device.bowls.length;
    for (const { index } of device.bowls) {
      features.push(
        feature(ids, `bowl-${index}`, language, { nameKey: bowlKey(count, index), kind: 'bowl' }),
      );
    }
    features.push(feature(ids, 'last-meal', language));
    features.push(feature(ids, 'last-meal-pet', language));
  }
  if (device.kind === 'felaqua') {
    features.push(feature(ids, 'water', language));
    features.push(feature(ids, 'water-level', language));
  }
  if (device.kind !== 'hub') {
    features.push(feature(ids, 'battery', language));
  }
  features.push(feature(ids, 'online', language));
  return features;
}

function petFeatures(ids, pet, account, language) {
  const kinds = new Set(
    account.devices.filter((d) => d.householdId === pet.householdId).map((d) => d.kind),
  );
  const features = [
    feature(ids, 'presence', language),
    feature(ids, 'location-duration', language),
  ];
  if (kinds.has('feeder') || pet.feeding) {
    features.push(feature(ids, 'last-meal', language));
  }
  if (kinds.has('felaqua') || pet.drinking) {
    features.push(feature(ids, 'last-drink', language));
  }
  return features;
}

/** The Gladys devices of the account: its devices, then its pets. */
export function buildDevices(gladys, account, language) {
  const household = (id) => account.households.get(id)?.name;
  const devices = account.devices.map((device) => {
    const ids = deviceIds(gladys, device.id);
    return {
      name: deviceName(device, language),
      external_id: ids.device,
      features: deviceFeatures(ids, device, language),
      params: params([
        ['household', household(device.householdId)],
        ['product_id', device.productId],
        ['serial_number', device.serial],
        ['sure_petcare_id', device.id],
      ]),
    };
  });
  const pets = account.pets.map((pet) => {
    const ids = petIds(gladys, pet.id);
    return {
      name: petName(pet, language),
      external_id: ids.device,
      features: petFeatures(ids, pet, account, language),
      params: params([
        ['household', household(pet.householdId)],
        ['sure_petcare_id', pet.id],
      ]),
    };
  });
  return [...devices, ...pets];
}

const state = (ids, role, value) => ({ device_feature_external_id: ids.feature(role), ...value });

/** The current values of a device (sent when they change). */
export function deviceStates(ids, device) {
  const states = [];
  if (device.online !== undefined) {
    states.push(state(ids, 'online', { state: device.online ? GLADYS.ON : GLADYS.OFF }));
  }
  if (device.battery !== undefined) {
    states.push(state(ids, 'battery', { state: device.battery }));
  }
  if (device.lockMode !== undefined) {
    states.push(state(ids, 'lock-mode', { text: device.lockMode }));
  }
  for (const bowl of device.bowls ?? []) {
    if (bowl.weight !== undefined) {
      states.push(state(ids, `bowl-${bowl.index}`, { state: Math.round(bowl.weight) }));
    }
  }
  if (device.water?.weight !== undefined) {
    states.push(state(ids, 'water', { state: Math.round(device.water.weight) }));
  }
  if (device.water?.percent !== undefined) {
    states.push(state(ids, 'water-level', { state: Math.round(device.water.percent) }));
  }
  return states;
}

/** The current values of a pet: the minutes at its current place. */
export function petStates(ids, pet, now) {
  if (pet.where === undefined || pet.since === undefined) {
    return [];
  }
  const minutes = Math.max(0, Math.floor((now - pet.since) / 60_000));
  return [state(ids, 'location-duration', { state: minutes })];
}

const dated = (ids, role, value, at, now, key) => ({
  ...state(ids, role, value),
  ...(at === undefined ? {} : { created_at: new Date(Math.min(at, now)).toISOString() }),
  key,
});

/**
 * The values that belong to a moment (a move, a meal), dated with it. `key`
 * tells them apart: each is sent once, even when equal to the previous one.
 */
export function datedStates(ids, entity, { kind, pets = [], now }) {
  const states = [];
  if (kind === 'pet') {
    if (entity.where !== undefined) {
      const present = entity.where === WHERE.INSIDE ? GLADYS.PRESENT : GLADYS.ABSENT;
      const key = `${entity.where}@${entity.since ?? ''}`;
      states.push(dated(ids, 'presence', { state: present }, entity.since, now, key));
    }
    if (entity.feeding) {
      const { amount, at } = entity.feeding;
      states.push(dated(ids, 'last-meal', { state: amount }, at, now, String(at)));
    }
    if (entity.drinking) {
      const { amount, at } = entity.drinking;
      states.push(dated(ids, 'last-drink', { state: Math.round(amount) }, at, now, String(at)));
    }
  } else if (entity.kind === 'feeder') {
    const meal = lastMealOf(entity, pets);
    if (meal) {
      const key = String(meal.at);
      states.push(dated(ids, 'last-meal', { state: meal.amount }, meal.at, now, key));
      states.push(dated(ids, 'last-meal-pet', { text: meal.petName || '—' }, meal.at, now, key));
    }
  }
  return states;
}
