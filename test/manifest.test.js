// -----------------------------------------------------------------------------
// The manifest is the contract with Gladys and the store: these tests tie it
// to the code, so a key renamed on one side only fails here.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULTS, LANGUAGES } from '../src/config.js';
import { ACTIONS, POLL_INTERVAL, SCENE_TRIGGERS } from '../src/constants.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const manifest = JSON.parse(read('gladys-assistant-integration.json'));
const handlers = read('src/handlers.js');
const app = read('src/app.js');

function* texts(node, path = '') {
  if (Array.isArray(node)) {
    for (const [i, entry] of node.entries()) {
      yield* texts(entry, `${path}[${i}]`);
    }
  } else if (node && typeof node === 'object') {
    if ('en' in node || 'fr' in node) {
      yield [path, node];
      return;
    }
    for (const [key, value] of Object.entries(node)) {
      yield* texts(value, `${path}.${key}`);
    }
  }
}

test('the store basics', () => {
  assert.equal(manifest.manifest_version, 1);
  assert.equal(manifest.type, 'device');
  assert.ok(manifest.name.length >= 3 && manifest.name.length <= 30);
  assert.match(manifest.gladys_version, /^>=5\.1\.0$/, 'scene triggers need Gladys 5.1');
  assert.equal(manifest.docker_image, `ghcr.io/lm1lc3n7/gladys-surepetcare:${manifest.version}`);
  assert.equal(manifest.version, JSON.parse(read('package.json')).version);
  assert.deepEqual(manifest.transports, ['cloud']);
  assert.ok(manifest.categories.length >= 1 && manifest.categories.length <= 3);
  for (const lang of ['en', 'fr']) {
    const length = manifest.description[lang].length;
    assert.ok(length >= 10 && length <= 100, `description.${lang}: ${length} characters`);
    const docs = read(`docs/${lang}.md`);
    assert.ok(docs.length >= 300, `docs/${lang}.md is too short for the store`);
    assert.match(
      docs,
      /not\s+affiliated\s+with\s+Sure\s+Petcare|sans\s+lien\s+avec\s+Sure\s+Petcare/i,
    );
  }
});

test('every text is in English and French', () => {
  for (const [path, text] of texts(manifest)) {
    for (const lang of ['en', 'fr']) {
      assert.ok(text[lang]?.trim(), `${path} needs ${lang}`);
    }
  }
});

test('the configuration matches the code', () => {
  const fields = Object.fromEntries(manifest.config_schema.map((f) => [f.key, f]));
  for (const [key, value] of Object.entries(DEFAULTS)) {
    assert.ok(fields[key], `${key} is not in the config_schema`);
    assert.deepEqual(fields[key].default, value, key);
  }
  assert.deepEqual(
    fields.language.options.map((o) => o.value),
    LANGUAGES,
  );
  assert.equal(fields.email.type, 'string');
  assert.equal(fields.password.type, 'secret', 'the password is never sent back to the browser');
  assert.equal(fields.email.required && fields.password.required, true);
  assert.deepEqual(
    [fields.poll_interval.min, fields.poll_interval.max],
    [POLL_INTERVAL.min, POLL_INTERVAL.max],
  );
  const intro = fields.intro;
  assert.equal(intro.type, 'section');
  for (const lang of ['en', 'fr']) {
    assert.ok(intro.description[lang].length <= 1000, `intro.${lang} over 1000 characters`);
    assert.match(intro.description[lang], /Sure Petcare/);
  }
  assert.ok(intro.links.length <= 5 && intro.links.every((l) => l.url.startsWith('https://')));
});

test('the keys of the manifest are the keys of the code', () => {
  assert.deepEqual(manifest.actions.map((a) => a.key).sort(), Object.values(ACTIONS).sort());
  for (const name of Object.keys(ACTIONS)) {
    assert.ok(handlers.includes(`onAction(ACTIONS.${name}`), `ACTIONS.${name} has no handler`);
  }
  assert.ok(handlers.includes('onSetValue'), 'the lock mode is set through onSetValue');
  assert.deepEqual(
    manifest.scene_triggers.map((t) => t.key).sort(),
    Object.values(SCENE_TRIGGERS).sort(),
  );
});

test('the trigger fields and variables are what the events carry', () => {
  // The data objects of pushSceneEvent in src/app.js: the meal one, then the move one.
  const [meal, move] = [...app.matchAll(/pushSceneEvent\(event\.key, \{([\s\S]*?)\}\);/g)].map(
    (m) => m[1],
  );
  const moves = ['pet', 'flap', 'pet_name', 'flap_name', 'by_hand', 'since'];
  const expected = {
    [SCENE_TRIGGERS.PET_WENT_OUT]: [move, moves],
    [SCENE_TRIGGERS.PET_CAME_IN]: [move, moves],
    [SCENE_TRIGGERS.PET_ATE]: [meal, ['pet', 'feeder', 'pet_name', 'feeder_name', 'amount', 'at']],
  };
  for (const trigger of manifest.scene_triggers) {
    const [sent, keys] = expected[trigger.key];
    const declared = [...trigger.fields, ...trigger.variables].map((f) => f.key);
    assert.deepEqual(declared, keys, trigger.key);
    for (const key of declared) {
      // pet and pet_name are in `common`, spread into both.
      const common = key === 'pet' || key === 'pet_name';
      assert.ok(
        common || new RegExp(`\\b${key}[:,]`).test(sent),
        `${trigger.key}: ${key} is never sent`,
      );
    }
    for (const field of trigger.fields) {
      assert.equal(field.source, 'devices');
      assert.equal(field.options, undefined);
    }
  }
  assert.match(app, /pet: petIds\(this\.gladys, pet\.id\)\.device,\s+pet_name:/);
});
