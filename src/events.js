// -----------------------------------------------------------------------------
// The scene events of the pets (pure): what changed between two readings.
//
// A reading only shows the last position and the last meal of each pet: two
// moves between two readings are one (the last), and a meal under 1 g (a
// visit, the app does not count it either) is no meal. The first reading of a
// pet, and anything older than TIMINGS.eventMaxAge when first seen (an
// outage, a restart), is history, not news.
// -----------------------------------------------------------------------------

import { SCENE_TRIGGERS, TIMINGS, WHERE } from './constants.js';

/** What the next comparison needs of a pet. */
export const snapshotOf = (pet) => ({
  where: pet.where,
  since: pet.since,
  mealAt: pet.feeding?.at,
});

/**
 * The events of a pet since its previous snapshot.
 * @returns {{ events: object[], stale: object[] }} `stale`: changes too old to fire
 */
export function petEvents(previous, pet, now) {
  const events = [];
  const stale = [];
  if (!previous) {
    return { events, stale };
  }
  const fresh = (at) => at === undefined || now - at <= TIMINGS.eventMaxAge;
  const moved =
    pet.where !== undefined && (pet.where !== previous.where || pet.since !== previous.since);
  if (moved) {
    const event = {
      key: pet.where === WHERE.INSIDE ? SCENE_TRIGGERS.PET_CAME_IN : SCENE_TRIGGERS.PET_WENT_OUT,
      at: pet.since ?? now,
      flapId: pet.flapId,
      byHand: pet.byHand,
    };
    (fresh(pet.since) ? events : stale).push(event);
  }
  const meal = pet.feeding;
  if (meal && meal.at !== previous.mealAt && meal.amount >= 1) {
    const event = {
      key: SCENE_TRIGGERS.PET_ATE,
      at: meal.at,
      feederId: meal.deviceId,
      amount: meal.amount,
    };
    (fresh(meal.at) ? events : stale).push(event);
  }
  return { events, stale };
}
