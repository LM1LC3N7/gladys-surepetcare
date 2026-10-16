// -----------------------------------------------------------------------------
// Manifest keys, Sure Petcare API constants, limits and timings.
// -----------------------------------------------------------------------------

/** The Sure Petcare cloud (app.api.surehub.io is a DNS alias of this host). */
export const API = {
  baseUrl: 'https://app-api.production.surehub.io/api',
  origin: 'https://surepetcare.io',
};

/** API paths, relative to API.baseUrl. */
export const PATHS = {
  login: () => '/auth/login',
  start: () => '/me/start',
  control: (deviceId) => `/device/${encodeURIComponent(deviceId)}/control`,
};

/** Sure Petcare `product_id` values (surepy's EntityType). */
export const PRODUCTS = {
  HUB: 1,
  REPEATER: 2,
  PET_FLAP: 3,
  FEEDER: 4,
  PROGRAMMER: 5,
  CAT_FLAP: 6,
  FEEDER_LITE: 7,
  FELAQUA: 8,
};

/** Sure Petcare `status.locking.mode`; 4 and below 0 are the curfew states. */
export const LOCKING = {
  UNLOCKED: 0,
  KEEP_IN: 1,
  KEEP_OUT: 2,
  LOCKED: 3,
  CURFEW: 4,
};

/** Lock modes as Gladys sees them: the option values of the select feature. */
export const LOCK_MODES = ['unlocked', 'keep_in', 'keep_out', 'locked', 'curfew'];

/** Pet `position.where`. */
export const WHERE = { INSIDE: 1, OUTSIDE: 2 };

/**
 * Gladys values (server/utils/constants.js of the Gladys core, not exported
 * by the SDK): a presence-sensor reports 1 when present, a binary input 1
 * when on.
 */
export const GLADYS = {
  PRESENT: 1,
  ABSENT: 0,
  ON: 1,
  OFF: 0,
};

/** Battery voltage range of one of the four AA cells (Home Assistant's values). */
export const BATTERY_VOLTAGE = { full: 1.6, low: 1.25, cells: 4 };

export const ACTIONS = {
  TEST_CONNECTION: 'test_connection',
};

export const SCENE_TRIGGERS = {
  PET_WENT_OUT: 'pet_went_out',
  PET_CAME_IN: 'pet_came_in',
  PET_ATE: 'pet_ate',
};

export const POLL_INTERVAL = { min: 30, max: 600, default: 60 };

export const LIMITS = {
  /** Gladys: 300 states per minute, 300 scene events per minute. */
  statesPerMinute: 300,
  sceneEventsPerMinute: 300,
  /** States per publishStates request. */
  statesPerRequest: 100,
  /** Largest answer read (a me/start of a big household is a few hundred KB). */
  responseBytes: 8 * 1024 * 1024,
  /** Scene event strings (Gladys accepts 1000 characters). */
  eventText: 200,
  /** Events kept while Gladys is unreachable. */
  queuedEvents: 500,
};

export const TIMINGS = {
  requestTimeout: 30_000,
  /** The publisher sends what is pending every second. */
  flushInterval: 1_000,
  /** An unchanged state is sent again every 30 minutes. */
  stateHeartbeat: 30 * 60_000,
  /** Sign in again this long before the session token expires. */
  tokenMargin: 60 * 60_000,
  /** Pauses after a failed read: 1, 2, 5, 10 then 15 minutes. */
  backoff: [60_000, 2 * 60_000, 5 * 60_000, 10 * 60_000, 15 * 60_000],
  /** After a 429 without Retry-After, and after a 403. */
  rateLimitPause: 15 * 60_000,
  forbiddenPause: 60 * 60_000,
  /** An event older than this when first seen (an outage, a restart) is not fired. */
  eventMaxAge: 15 * 60_000,
  /** A lock mode just set wins over the readings that do not show it yet. */
  commandGuard: 2 * 60_000,
  /** A read soon after a command, to show the result. */
  afterCommand: 10_000,
  /** The "Test the connection" button reads Sure Petcare at most this often. */
  testCooldown: 30_000,
};
