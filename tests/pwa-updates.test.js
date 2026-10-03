import test from 'node:test';
import assert from 'node:assert/strict';
import { checkForUpdate } from '../src/pwa-updates.js';

test('проверка дожидается полной загрузки версии перед применением', async () => {
  const installing = new EventTarget();
  installing.state = 'installing';
  const registration = { update: async () => {}, installing, waiting: null };
  let settled = false;
  const result = checkForUpdate(registration).then((value) => { settled = true; return value; });
  await Promise.resolve();
  assert.equal(settled, false);
  const waiting = {};
  registration.waiting = waiting;
  installing.state = 'installed';
  installing.dispatchEvent(new Event('statechange'));
  assert.equal(await result, waiting);
});

test('готовое обновление, последняя версия и ошибка сети различаются', async () => {
  const waiting = {};
  assert.equal(await checkForUpdate({ update: async () => {}, waiting }), waiting);
  assert.equal(await checkForUpdate({ update: async () => {} }), null);
  await assert.rejects(checkForUpdate({ update: async () => { throw Error('offline'); } }), /offline/);
});

test('неудачная установка не выдаётся за актуальную версию', async () => {
  const installing = new EventTarget();
  installing.state = 'redundant';
  await assert.rejects(checkForUpdate({ update: async () => {}, installing }), /installation failed/);
});
