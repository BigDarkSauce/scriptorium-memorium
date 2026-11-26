#!/usr/bin/env node
import assert from 'node:assert/strict';

const values = new Map();
globalThis.localStorage = {
  getItem(key) { return values.has(key) ? values.get(key) : null; },
  setItem(key, value) { values.set(key, String(value)); },
  removeItem(key) { values.delete(key); }
};

const FREE = await import('../js/ai/free.js');
assert.equal(FREE.via(), 'direct');
const initial = FREE.settings();
assert.ok(Array.isArray(initial.customProviders));
assert.equal(initial.customProviders.length, 0);

let saved = FREE.addCustomProvider('DeepSeek via gateway');
const first = saved.customProviders[0];
assert.ok(first.id.startsWith('custom-'));
assert.equal(first.name, 'DeepSeek via gateway');
assert.equal(saved.on[first.id], true);

saved = FREE.saveSettings({
  bases: { ...saved.bases, [first.id]: 'https://api.example.test/v1/' },
  models: { ...saved.models, [first.id]: 'deepseek-chat' },
  keys: { ...saved.keys, [first.id]: 'sk-test-custom-secret' }
});
const p = FREE.providers(saved).find(x => x.id === first.id);
assert.ok(p && p.custom);
assert.equal(p.name, 'DeepSeek via gateway');
assert.equal(FREE.baseOf(p, saved), 'https://api.example.test/v1');
assert.equal(FREE.keyOf(p, saved), 'sk-test-custom-secret');
assert.equal(FREE.isOn(p, saved), true);
assert.ok(FREE.active(saved).some(x => x.id === first.id));
assert.deepEqual((await FREE.models(p)).map(x => x.id), ['deepseek-chat']);

saved = FREE.renameCustomProvider(first.id, 'Private inference gateway');
assert.equal(FREE.providers(saved).find(x => x.id === first.id).name, 'Private inference gateway');

saved = FREE.addCustomProvider('Second provider');
const second = saved.customProviders.find(x => x.id !== first.id);
saved = FREE.saveSettings({
  bases: { ...saved.bases, [second.id]: 'https://second.example.test/v1' },
  models: { ...saved.models, [second.id]: 'second-model' }
});
assert.equal(saved.customProviders.length, 2);
assert.ok(FREE.active(saved).some(x => x.id === first.id));
assert.ok(FREE.active(saved).some(x => x.id === second.id));

saved = FREE.removeCustomProvider(first.id);
assert.equal(saved.customProviders.some(x => x.id === first.id), false);
assert.equal(saved.keys[first.id], undefined);
assert.equal(saved.bases[first.id], undefined);
assert.equal(saved.models[first.id], undefined);
assert.equal(saved.customProviders.length, 1);
assert.ok(FREE.active(saved).some(x => x.id === second.id));

saved = FREE.removeCustomProvider(second.id);
assert.equal(saved.customProviders.length, 0);
assert.equal(FREE.providers(saved).length, FREE.PROVIDERS.length);

// Existing saved custom endpoint settings migrate into the new multi-entry form.
values.set('sm-ai', JSON.stringify({
  keys: { custom: 'sk-test-legacy' },
  bases: { custom: 'https://legacy.example.test/v1' },
  models: { custom: 'legacy-model' },
  on: { custom: true }
}));
const migrated = FREE.settings();
const legacy = migrated.customProviders.find(x => x.id === 'custom-legacy');
assert.ok(legacy);
assert.equal(migrated.keys['custom-legacy'], 'sk-test-legacy');
assert.equal(migrated.bases['custom-legacy'], 'https://legacy.example.test/v1');
assert.equal(migrated.models['custom-legacy'], 'legacy-model');
assert.equal(migrated.on['custom-legacy'], true);
assert.equal(migrated.keys.custom, undefined);

console.log('custom provider settings: add, rename, independent credentials/models, enable, remove and legacy migration passed');
