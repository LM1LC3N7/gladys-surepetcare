// -----------------------------------------------------------------------------
// The integration: the Sure Petcare account (e-mail and password), one read
// of everything per poll (GET /me/start), the Gladys devices of the devices
// and pets, their states, the scene events of the pets, the lock mode
// commands and the transport badges. index.js only wires the SDK handlers to
// it.
// -----------------------------------------------------------------------------

import { randomUUID } from 'node:crypto';
import { DEVICE_TRANSPORTS, createLogger } from '@gladysassistant/integration-sdk';
import { SurePetcareClient } from './client.js';
import { normalizeConfig } from './config.js';
import { LIMITS, LOCK_MODES, TIMINGS } from './constants.js';
import {
  buildDevices,
  datedStates,
  deviceIds,
  deviceName,
  deviceStates,
  parseFeatureId,
  petIds,
  petName,
  petStates,
} from './devices.js';
import { petEvents, snapshotOf } from './events.js';
import { T, age, word } from './i18n.js';
import { hasTimes, numberOf, readAccount } from './inventory.js';
import { StatePublisher } from './publisher.js';
import { errorReason } from './surepetcare.js';
import { fileStore, normalizeMemory } from './store.js';

const cut = (text, max = LIMITS.eventText) => (text.length > max ? text.slice(0, max) : text);

/** Errors after which only a change of the configuration (or the test button) helps. */
const REFUSED = new Set(['refused', 'no_credentials']);
/** Errors meaning Sure Petcare did not answer usefully: the devices are unreachable. */
const OFFLINE = new Set(['network', 'timeout', 'unavailable', 'bad_response', 'size', 'http']);

const LOCKING_OF = { unlocked: 0, keep_in: 1, keep_out: 2, locked: 3 };

export class SurePetcareApp {
  constructor({
    gladys,
    logger = createLogger({ name: 'surepetcare' }),
    transport,
    now = Date.now,
    timers = globalThis,
    store = fileStore(),
    randomId = randomUUID,
    userAgent,
  }) {
    this.gladys = gladys;
    this.logger = logger;
    this.now = now;
    this.timers = timers;
    this.store = store;
    this.randomId = randomId;
    this.client = new SurePetcareClient({
      transport,
      now,
      userAgent,
      onSession: (session) => this.saveSession(session),
    });
    this.publisher = new StatePublisher({ gladys, logger, now, timers });
    this.config = normalizeConfig();
    /** The last account read (readAccount), undefined before the first read. */
    this.account = undefined;
    this.readAt = undefined;
    /** petId -> snapshot of the previous reading, for the events */
    this.snapshots = new Map();
    /** featureId -> key of the dated state last queued */
    this.sentDated = new Map();
    /** flapId -> { mode, until }: a lock mode just set, not read back yet */
    this.guards = new Map();
    this.published = undefined;
    /** deviceId -> badge last published (JSON) */
    this.transports = new Map();
    this.timer = undefined;
    this.soonTimer = undefined;
    this.running = undefined;
    this.generation = 0;
    this.refused = false;
    this.offline = false;
    this.connectedOnce = false;
    this.failures = 0;
    this.pausedUntil = 0;
    this.lastTestAt = -Infinity;
    this.memory = normalizeMemory(null);
    this.started = false;
    this.lastStatus = undefined;
    this.warnedProducts = new Set();
  }

  // --- Lifecycle -------------------------------------------------------------

  async start(raw = {}) {
    this.stop();
    await this.running;
    this.config = normalizeConfig(raw);
    this.reset();
    this.memory = normalizeMemory(await this.store.load().catch(() => null));
    if (!this.memory.deviceId) {
      this.memory.deviceId = this.randomId();
      await this.saveMemory();
    }
    const { email, password, account } = this.config;
    const session = this.memory.session?.account === account ? this.memory.session : null;
    this.client.configure({ email, password, deviceId: this.memory.deviceId, session });
    this.publisher.start();
    if (!this.client.hasCredentials) {
      await this.setStatus(false, T.noCredentials);
      return;
    }
    await this.setStatus(false, T.connecting);
    this.schedule();
    await this.tick();
  }

  stop() {
    this.generation += 1;
    if (this.timer) {
      this.timers.clearInterval(this.timer);
      this.timer = undefined;
    }
    if (this.soonTimer) {
      this.timers.clearTimeout(this.soonTimer);
      this.soonTimer = undefined;
    }
    this.publisher.stop();
  }

  /** Forgets the account and the failures: a new account, or a restart. */
  reset() {
    this.account = undefined;
    this.readAt = undefined;
    this.snapshots.clear();
    this.sentDated.clear();
    this.guards.clear();
    this.published = undefined;
    this.transports.clear();
    this.refused = false;
    this.offline = false;
    this.connectedOnce = false;
    this.failures = 0;
    this.pausedUntil = 0;
  }

  schedule() {
    if (this.timer) {
      this.timers.clearInterval(this.timer);
    }
    this.timer = this.timers.setInterval(() => {
      this.tick().catch((err) => this.logger.error(`Sure Petcare refresh failed: ${err.message}`));
    }, this.config.pollInterval * 1000);
  }

  /** A read soon after a command, to show its result. */
  soon() {
    if (this.soonTimer) {
      this.timers.clearTimeout(this.soonTimer);
    }
    this.soonTimer = this.timers.setTimeout(() => {
      this.soonTimer = undefined;
      this.tick().catch((err) => this.logger.error(`Sure Petcare refresh failed: ${err.message}`));
    }, TIMINGS.afterCommand);
  }

  /**
   * Connected to Gladys. The first time, start; after a reconnection (Gladys
   * restarted), resend what Gladys keeps in memory only (Discovery list,
   * status, badges) without reading Sure Petcare again.
   */
  async connected(raw = {}) {
    if (!this.started) {
      this.started = true;
      await this.start(raw);
      return;
    }
    await this.configUpdated(raw);
    this.published = undefined;
    this.transports.clear();
    const status = this.lastStatus;
    this.lastStatus = undefined;
    if (status) {
      const [connected, message] = JSON.parse(status);
      await this.setStatus(connected, message ?? undefined);
    }
    await this.publishDevices();
    await this.publishAllTransports();
  }

  /** A new account restarts; a new interval reschedules; a new language renames. */
  async configUpdated(raw = {}) {
    const next = normalizeConfig(raw);
    const previous = this.config;
    if (next.email !== previous.email || next.password !== previous.password) {
      return this.start(raw);
    }
    this.config = next;
    if (next.pollInterval !== previous.pollInterval && this.timer) {
      this.schedule();
    }
    if (next.language !== previous.language) {
      await this.publishDevices();
    }
  }

  async setStatus(connected, message) {
    const key = JSON.stringify([connected, message ?? null]);
    if (key === this.lastStatus) {
      return;
    }
    this.lastStatus = key;
    await this.gladys
      .setConnectionStatus(connected, message)
      .catch((err) => this.logger.warn(`setConnectionStatus failed: ${err.message}`));
  }

  async saveMemory() {
    await this.store
      .save(this.memory)
      .catch((err) => this.logger.warn(`Saving the state to /data failed: ${err.message}`));
  }

  async saveSession({ token, expiresAt }) {
    this.memory.session = { account: this.config.account, token, expiresAt };
    await this.saveMemory();
  }

  // --- Polling ---------------------------------------------------------------

  /** One run at a time: a tick during a run joins it. */
  tick() {
    if (!this.running) {
      this.running = this.run().finally(() => {
        this.running = undefined;
      });
    }
    return this.running;
  }

  async run() {
    const generation = this.generation;
    if (!this.client.hasCredentials || this.refused || this.now() < this.pausedUntil) {
      return;
    }
    try {
      const data = await this.client.start();
      if (generation !== this.generation) {
        return;
      }
      await this.apply(readAccount(data));
      this.failures = 0;
      this.offline = false;
      this.connectedOnce = true;
      await this.setStatus(true, this.statusMessage());
    } catch (err) {
      if (generation !== this.generation) {
        return;
      }
      await this.failed(err);
    }
    await this.publishAllTransports();
    await this.publisher
      .flush()
      .catch((err) => this.logger.warn(`Sending to Gladys failed: ${err.message}`));
  }

  counts() {
    return {
      households: this.account?.households.size ?? 0,
      devices: this.account?.devices.length ?? 0,
      pets: this.account?.pets.length ?? 0,
    };
  }

  statusMessage() {
    return T.connected(this.counts(), this.client.session?.expiresAt);
  }

  async failed(err) {
    const reason = errorReason(err);
    if (REFUSED.has(err.kind)) {
      // Never signed in again by itself: two refused sign-ins may lock the account.
      this.refused = true;
      this.logger.warn(`Sure Petcare refused the sign-in: ${reason}`);
      await this.setStatus(false, this.connectedOnce ? T.expired : T.refused);
      return;
    }
    let wait;
    if (err.kind === 'rate_limited') {
      wait = Math.max(err.retryAfter ?? TIMINGS.rateLimitPause, TIMINGS.backoff[0]);
      await this.setStatus(this.connectedOnce, T.rateLimited(age(wait)));
    } else if (err.kind === 'forbidden') {
      wait = TIMINGS.forbiddenPause;
      this.offline = true;
      await this.setStatus(false, T.forbidden(age(wait)));
    } else {
      wait = TIMINGS.backoff[Math.min(this.failures, TIMINGS.backoff.length - 1)];
      this.offline = OFFLINE.has(err.kind) || this.offline;
      await this.setStatus(false, T.unreachable(reason, age(wait)));
    }
    this.failures += 1;
    this.pausedUntil = this.now() + wait;
    this.logger.warn(`Sure Petcare: ${reason}; next try in ${Math.round(wait / 1000)} s`);
  }

  async apply(account) {
    this.account = account;
    this.readAt = this.now();
    for (const device of account.skipped) {
      if (!this.warnedProducts.has(device.id)) {
        this.warnedProducts.add(device.id);
        this.logger.info(`Device ${device.id} (product ${device.productId}) is not supported yet`);
      }
    }
    await this.publishDevices();
    this.queueStates();
    this.queueEvents();
  }

  // --- Gladys ----------------------------------------------------------------

  async publishDevices() {
    if (!this.account) {
      return;
    }
    const devices = buildDevices(this.gladys, this.account, this.config.language);
    const json = JSON.stringify(devices);
    if (json === this.published) {
      return;
    }
    try {
      await this.gladys.publishDiscoveredDevices(devices);
      this.published = json;
    } catch (err) {
      this.logger.warn(`Publishing the discovered devices failed: ${err.message}`);
    }
  }

  createdFeatures() {
    return new Set(
      (this.gladys.devices ?? []).flatMap((d) => (d.features ?? []).map((f) => f.external_id)),
    );
  }

  /** The device with the lock mode just commanded, until a reading shows it. */
  guarded(device) {
    const guard = this.guards.get(device.id);
    if (!guard) {
      return device;
    }
    if (device.lockMode === guard.mode || this.now() >= guard.until) {
      this.guards.delete(device.id);
      return device;
    }
    return { ...device, lockMode: guard.mode };
  }

  /** The states of the created features: current values, and dated ones once each. */
  queueStates(created = this.createdFeatures()) {
    if (!this.account) {
      return;
    }
    const now = this.now();
    const queue = (states) => {
      for (const { device_feature_external_id: id, ...value } of states) {
        if (created.has(id)) {
          this.publisher.push(id, value);
        }
      }
    };
    const queueDated = (states) => {
      for (const { device_feature_external_id: id, key, ...value } of states) {
        if (created.has(id) && this.sentDated.get(id) !== key) {
          this.sentDated.set(id, key);
          this.publisher.pushEvent(id, value);
        }
      }
    };
    const { devices, pets } = this.account;
    for (const device of devices) {
      const ids = deviceIds(this.gladys, device.id);
      queue(deviceStates(ids, this.guarded(device)));
      queueDated(datedStates(ids, device, { pets, now }));
    }
    for (const pet of pets) {
      const ids = petIds(this.gladys, pet.id);
      queue(petStates(ids, pet, now));
      queueDated(datedStates(ids, pet, { kind: 'pet', now }));
    }
  }

  /** The scene events of the pets since the previous reading. */
  queueEvents() {
    const now = this.now();
    const devices = new Map(this.account.devices.map((d) => [d.id, d]));
    const language = this.config.language;
    const nameOf = (id) => {
      const device = id === null || id === undefined ? undefined : devices.get(id);
      return device ? deviceName(device, language) : '';
    };
    const idOf = (id) =>
      id === null || id === undefined ? null : deviceIds(this.gladys, id).device;
    for (const pet of this.account.pets) {
      const { events, stale } = petEvents(this.snapshots.get(pet.id), pet, now);
      this.snapshots.set(pet.id, snapshotOf(pet));
      const name = petName(pet, language);
      for (const event of stale) {
        this.logger.info(
          `${name}: ${event.key} of ${new Date(event.at).toISOString()} is too old to fire`,
        );
      }
      for (const event of events) {
        const common = {
          pet: petIds(this.gladys, pet.id).device,
          pet_name: cut(name),
        };
        const at = new Date(event.at).toISOString();
        this.logger.info(`${name}: ${event.key}`);
        if (event.feederId !== undefined) {
          this.publisher.pushSceneEvent(event.key, {
            ...common,
            feeder: idOf(event.feederId),
            feeder_name: cut(nameOf(event.feederId)),
            amount: event.amount,
            at,
          });
        } else {
          this.publisher.pushSceneEvent(event.key, {
            ...common,
            flap: idOf(event.flapId),
            flap_name: cut(nameOf(event.flapId)),
            by_hand: event.byHand,
            since: at,
          });
        }
      }
    }
  }

  badge(entity) {
    if (this.refused || this.offline) {
      return { transport: DEVICE_TRANSPORTS.UNREACHABLE };
    }
    if (entity.online === false) {
      return { transport: DEVICE_TRANSPORTS.UNREACHABLE, degraded: true, message: T.offline };
    }
    return { transport: DEVICE_TRANSPORTS.CLOUD };
  }

  async publishAllTransports() {
    if (!this.account) {
      return;
    }
    const created = new Set((this.gladys.devices ?? []).map((d) => d.external_id));
    const entries = [];
    const add = (externalId, entity) => {
      if (!created.has(externalId)) {
        return;
      }
      const entry = { external_id: externalId, ...this.badge(entity) };
      const json = JSON.stringify(entry);
      if (this.transports.get(externalId) !== json) {
        this.transports.set(externalId, json);
        entries.push(entry);
      }
    };
    for (const device of this.account.devices) {
      add(deviceIds(this.gladys, device.id).device, device);
    }
    for (const pet of this.account.pets) {
      add(petIds(this.gladys, pet.id).device, pet);
    }
    if (entries.length > 0) {
      await this.gladys
        .publishTransports(entries)
        .catch((err) => this.logger.warn(`Transport badges failed: ${err.message}`));
    }
  }

  forgetDated(device) {
    for (const f of device?.features ?? []) {
      this.sentDated.delete(f.external_id);
    }
  }

  /** A device was created (or updated): send its last values at once. */
  async deviceCreated(device) {
    this.transports.delete(device?.external_id);
    this.forgetDated(device);
    const created = this.createdFeatures();
    for (const f of device?.features ?? []) {
      created.add(f.external_id);
    }
    this.queueStates(created);
    await this.publisher
      .flush()
      .catch((err) => this.logger.warn(`Sending to Gladys failed: ${err.message}`));
    await this.publishAllTransports();
  }

  async deviceDeleted(device) {
    this.transports.delete(device?.external_id);
    this.forgetDated(device);
    if (device?.external_id) {
      this.publisher.forget(device.external_id);
    }
  }

  /** The Discovery tab asks for a scan: a fresh read if the last one is old enough. */
  async scan() {
    if (
      this.client.hasCredentials &&
      !this.refused &&
      (this.readAt === undefined || this.now() - this.readAt >= TIMINGS.testCooldown)
    ) {
      await this.tick();
      return;
    }
    await this.publishDevices();
  }

  // --- Commands --------------------------------------------------------------

  async setValue(device, feature, value) {
    const target = parseFeatureId(feature?.external_id);
    if (!target || target.kind !== 'device' || target.role !== 'lock-mode') {
      throw new Error(`${feature?.external_id} cannot be set`);
    }
    const mode = String(value);
    if (!LOCK_MODES.includes(mode)) {
      throw new Error(`Unknown lock mode "${mode}"`);
    }
    if (this.refused) {
      throw new Error(word(T.refused, this.config.language));
    }
    const flap = this.account?.devices.find((d) => d.id === target.id && d.kind === 'flap');
    if (!flap) {
      throw new Error('Unknown flap: wait for the first reading of the account');
    }
    try {
      await this.setLockMode(flap, mode);
    } catch (err) {
      // The ack shows the message: the Sure Petcare one, with its HTTP status.
      throw new Error(errorReason(err), { cause: err });
    }
    this.logger.info(`${deviceName(flap, this.config.language)}: lock mode ${mode}`);
    this.guards.set(flap.id, { mode, until: this.now() + TIMINGS.commandGuard });
    this.publisher.push(feature.external_id, { text: mode });
    await this.publisher
      .flush()
      .catch((err) => this.logger.warn(`Sending to Gladys failed: ${err.message}`));
    this.soon();
  }

  /**
   * The curfew is its own setting: "curfew" enables the curfew times of the
   * flap (the ones enabled last time, all of them otherwise); another mode
   * disables the curfew first, then sets `locking`.
   */
  async setLockMode(flap, mode) {
    const { shape, entries } = flap.curfew;
    const wrap = (list) => (shape === 'object' ? list[0] : list);
    const language = this.config.language;
    // The account read may be a minute old: what was sent is what the flap has now.
    const sendCurfew = async (next) => {
      await this.client.control(flap.id, { curfew: wrap(next) });
      flap.curfew = { shape, entries: next };
    };
    if (mode === 'curfew') {
      const timed = entries.map((e, i) => (hasTimes(e) ? i : -1)).filter((i) => i >= 0);
      if (timed.length === 0) {
        throw new Error(word(T.noCurfew, language));
      }
      const remembered = (this.memory.curfews[flap.id] ?? []).filter((i) => timed.includes(i));
      const on = new Set(remembered.length > 0 ? remembered : timed);
      await sendCurfew(entries.map((e, i) => (hasTimes(e) ? { ...e, enabled: on.has(i) } : e)));
      return;
    }
    if (entries.some((e) => e.enabled === true)) {
      this.memory.curfews[flap.id] = entries
        .map((e, i) => (e.enabled === true ? i : -1))
        .filter((i) => i >= 0);
      await this.saveMemory();
      await sendCurfew(entries.map((e) => ({ ...e, enabled: false })));
    }
    const locking = LOCKING_OF[mode];
    const answer = await this.client.control(flap.id, { locking });
    const applied = numberOf(answer.locking);
    if (applied !== undefined && applied !== locking) {
      throw new Error(word(T.notApplied, language));
    }
  }

  // --- "Test the connection" button -----------------------------------------

  async testConnection() {
    if (!this.client.hasCredentials) {
      return T.noCredentials;
    }
    if (this.account && this.now() - this.lastTestAt < TIMINGS.testCooldown) {
      const summary = this.summary();
      return {
        en: `${T.test.cooldown.en} ${summary.en}`,
        fr: `${T.test.cooldown.fr} ${summary.fr}`,
      };
    }
    this.lastTestAt = this.now();
    // One sign-in per click: the button is how a refused account is retried.
    this.refused = false;
    this.pausedUntil = 0;
    await this.running;
    await this.tick();
    const [connected, message] = JSON.parse(this.lastStatus ?? '[false,null]');
    if (!connected || !this.account) {
      return message ?? T.noCredentials;
    }
    return this.summary();
  }

  /** The households, devices and pets, where each pet is, and the session expiry. */
  summary() {
    const lines = [
      T.test.summary(this.counts()),
      ...(this.account?.pets ?? []).map((pet) =>
        T.test.pet(petName(pet, this.config.language), pet.where),
      ),
      T.session(this.client.session?.expiresAt),
    ];
    const join = (language) =>
      lines
        .map((line) => line[language])
        .filter(Boolean)
        .join(' ');
    return { en: join('en'), fr: join('fr') };
  }
}
