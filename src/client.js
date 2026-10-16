// -----------------------------------------------------------------------------
// The Sure Petcare account: the session (a JWT from the sign-in with the
// e-mail, the password and a client id), renewed before its `exp` and once
// when the API refuses it, and the three calls the integration needs. Every
// request goes through the transport of src/surepetcare.js.
// -----------------------------------------------------------------------------

import { API, PATHS, TIMINGS } from './constants.js';
import { SurePetcareError, errorFor, httpRequest, parseData, tokenExpiry } from './surepetcare.js';

export class SurePetcareClient {
  constructor({
    transport = httpRequest,
    now = Date.now,
    baseUrl = API.baseUrl,
    userAgent = 'gladys-surepetcare',
    onSession,
  } = {}) {
    this.transport = transport;
    this.now = now;
    this.baseUrl = baseUrl;
    this.userAgent = userAgent;
    /** Called with the new session `{ token, expiresAt }` after a sign-in (never throws). */
    this.onSession = onSession;
    this.email = '';
    this.password = '';
    /** The client id sent at the sign-in and with every request (stable, from /data). */
    this.deviceId = '';
    /** { token, expiresAt } | null; expiresAt undefined when the token says nothing. */
    this.session = null;
    this.signingIn = undefined;
  }

  configure({ email, password, deviceId, session = null }) {
    this.email = email;
    this.password = password;
    this.deviceId = deviceId;
    this.session = session?.token ? session : null;
  }

  get hasCredentials() {
    return this.email !== '' && this.password !== '';
  }

  headers(token, body) {
    const headers = {
      Accept: 'application/json, text/plain, */*',
      Origin: API.origin,
      Referer: `${API.origin}/`,
      'User-Agent': this.userAgent,
      'X-Device-Id': this.deviceId,
    };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(body);
    }
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    return headers;
  }

  async send(method, path, { payload, token, login = false } = {}) {
    const body = payload === undefined ? undefined : JSON.stringify(payload);
    const answer = await this.transport(`${this.baseUrl}${path}`, {
      method,
      headers: this.headers(token, body),
      body,
    });
    if (answer.status < 200 || answer.status >= 300) {
      throw errorFor(answer, { login, now: this.now() });
    }
    return parseData(answer.body);
  }

  /** Signs in; one sign-in at a time, the others wait for it. */
  login() {
    if (!this.hasCredentials) {
      return Promise.reject(new SurePetcareError('no_credentials', 'no e-mail or password'));
    }
    if (!this.signingIn) {
      const { email } = this;
      this.signingIn = this.send('POST', PATHS.login(), {
        payload: { email_address: email, password: this.password, device_id: this.deviceId },
        login: true,
      })
        .then(async (data) => {
          const token = data?.token;
          if (typeof token !== 'string' || token === '') {
            throw new SurePetcareError('bad_response', 'Sure Petcare sent no session token');
          }
          const session = { token, expiresAt: tokenExpiry(token) };
          // A sign-in started for another account never overwrites the new one.
          if (this.email === email) {
            this.session = session;
            await this.onSession?.(session);
          }
          return session;
        })
        .finally(() => {
          this.signingIn = undefined;
        });
    }
    return this.signingIn;
  }

  /** Whether the session token is missing or about to expire. */
  needsLogin() {
    if (!this.session) {
      return true;
    }
    const { expiresAt } = this.session;
    return expiresAt !== undefined && this.now() >= expiresAt - TIMINGS.tokenMargin;
  }

  async token() {
    if (this.needsLogin()) {
      await this.login();
    }
    return this.session.token;
  }

  async call(method, path, payload) {
    const token = await this.token();
    try {
      return await this.send(method, path, { payload, token });
    } catch (err) {
      if (err.kind !== 'unauthorized') {
        throw err;
      }
      // Expired early or revoked: one sign-in, one retry.
      if (this.session?.token === token) {
        this.session = null;
      }
      return this.send(method, path, { payload, token: await this.token() });
    }
  }

  /** Households, devices and pets with their statuses, in one answer. */
  async start() {
    const data = await this.call('GET', PATHS.start());
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new SurePetcareError('bad_response', 'Sure Petcare sent no account data');
    }
    return data;
  }

  /** Changes the control of a device (`{ locking }`, `{ curfew }`); resolves the control sent back. */
  async control(deviceId, payload) {
    const data = await this.call('PUT', PATHS.control(deviceId), payload);
    return data && typeof data === 'object' ? data : {};
  }
}
