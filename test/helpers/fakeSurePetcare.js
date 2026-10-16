// -----------------------------------------------------------------------------
// A fake Sure Petcare cloud behind the transport the integration is given:
// the sign-in, me/start and the device control, with the status codes the
// community clients document (401 for a refused token, 422 for a sign-in
// without its fields). Records every request. No network.
// -----------------------------------------------------------------------------

import { API } from '../../src/constants.js';
import { SurePetcareError } from '../../src/surepetcare.js';
import { DAY, EMAIL, PASSWORD, jwt, meStart } from '../fixtures/surepetcare.js';

const answer = (status, body, headers = {}) => ({
  status,
  headers,
  body: typeof body === 'string' ? body : JSON.stringify(body),
});

export function fakeSurePetcare({ data = meStart(), lifetime = 30 * DAY } = {}) {
  const server = {
    data,
    email: EMAIL,
    password: PASSWORD,
    lifetime,
    /** { method, path, body, token, headers, at } */
    requests: [],
    tokens: new Set(),
    issued: 0,
    /** No answer at all (DNS, connection refused). */
    down: false,
    /** One-shot answers: { match(request), status, body, headers } */
    queue: [],
    logins() {
      return this.requests.filter((r) => r.path === '/auth/login');
    },
    reads() {
      return this.requests.filter((r) => r.path === '/me/start');
    },
    controls() {
      return this.requests.filter((r) => r.method === 'PUT');
    },
    device(id) {
      return this.data.devices.find((d) => d.id === id);
    },
    pet(id) {
      return this.data.pets.find((p) => p.id === id);
    },
    issue() {
      this.issued += 1;
      const token = jwt({
        sub: 4001,
        n: this.issued,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor((Date.now() + this.lifetime) / 1000),
      });
      this.tokens.add(token);
      return token;
    },
  };

  server.transport = async (url, { method = 'GET', headers = {}, body } = {}) => {
    const path = new URL(url).pathname.replace(new URL(API.baseUrl).pathname, '');
    const request = {
      method,
      path,
      body: body === undefined ? undefined : JSON.parse(body),
      token: String(headers.Authorization ?? '').replace(/^Bearer /, ''),
      headers,
      at: Date.now(),
    };
    server.requests.push(request);
    if (server.down) {
      throw new SurePetcareError('network', 'connection refused');
    }
    const forced = server.queue.findIndex((q) => q.match(request));
    if (forced >= 0) {
      const [{ status, body: forcedBody, headers: forcedHeaders }] = server.queue.splice(forced, 1);
      return answer(status, forcedBody, forcedHeaders);
    }

    if (path === '/auth/login' && method === 'POST') {
      const { email_address: email, password, device_id: deviceId } = request.body ?? {};
      if (!email || !password || !deviceId) {
        return answer(422, { success: false, error: { email_address: ['required'] } });
      }
      if (email !== server.email || password !== server.password) {
        return answer(401, { error: { login: ['Invalid credentials'] } });
      }
      return answer(200, { data: { token: server.issue(), user: { id: 4001 } } });
    }

    if (!server.tokens.has(request.token)) {
      return answer(401, { error: 'Unauthenticated.' });
    }
    if (path === '/me/start' && method === 'GET') {
      return answer(200, { data: server.data });
    }
    const control = /^\/device\/(\d+)\/control$/.exec(path);
    if (control && method === 'PUT') {
      const device = server.device(Number(control[1]));
      if (!device) {
        return answer(404, { error: 'Not found' });
      }
      device.control ??= {};
      if ('locking' in request.body) {
        device.control.locking = request.body.locking;
        device.status.locking = { mode: request.body.locking };
      }
      if ('curfew' in request.body) {
        device.control.curfew = request.body.curfew;
      }
      return answer(200, { data: device.control });
    }
    return answer(404, { error: 'Not found' });
  };

  return server;
}

/** An in-memory store, in place of the /data file. */
export function memoryStore(initial = null) {
  return {
    data: initial,
    saves: 0,
    async load() {
      return this.data === null ? null : structuredClone(this.data);
    },
    async save(data) {
      this.saves += 1;
      this.data = structuredClone(data);
    },
  };
}

/** Lets the pending promises settle (no timer involved). */
export const settle = async (rounds = 20) => {
  for (let i = 0; i < rounds; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
};
