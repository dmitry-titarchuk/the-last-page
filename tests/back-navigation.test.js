import test from 'node:test';
import assert from 'node:assert/strict';
import { setupBackNavigation } from '../src/back-navigation.js';

function setup(installed = true) {
  const events = new Map();
  const entries = [{ other: 'preserved' }];
  let index = 0;
  let backs = 0;
  const history = {
    get state() { return entries[index]; },
    replaceState(state) { entries[index] = state; },
    pushState(state) { entries.splice(++index, entries.length, state); },
  };
  const window = {
    history, navigator: {}, matchMedia: () => ({ matches: installed }),
    addEventListener: (name, callback) => events.set(name, callback),
  };
  const document = { addEventListener: (name, callback) => events.set(name, callback) };
  setupBackNavigation(window, document, () => backs++);
  return {
    events, entries, history, get backs() { return backs; },
    back() { --index; events.get('popstate')({ state: history.state }); },
    reload() { setupBackNavigation(window, document, () => backs++); },
  };
}

test('Installed game consumes repeated Back gestures without growing history', () => {
  const app = setup();
  assert.equal(app.entries.length, 1, 'Wait for user interaction');
  app.events.get('pointerdown')();
  assert.equal(app.entries.length, 2);
  assert.equal(app.history.state.other, 'preserved');
  for (let i = 0; i < 10; i++) {
    app.events.get('pointerdown')();
    app.back();
    assert.equal(app.entries.length, 2);
    assert.equal(app.history.state.lastPageBackGuard, 'active');
    assert.equal(app.backs, i + 1);
  }
  app.reload();
  app.events.get('keydown')();
  assert.equal(app.entries.length, 2, 'Reload reuses existing guard');
  app.back();
  assert.equal(app.backs, 11);
});

test('Closing intro arms Back protection even if dismissed by the system', () => {
  const app = setup();
  app.events.get('close')();
  app.back();
  assert.equal(app.backs, 1);
});

test('Ordinary browser tabs keep normal Back navigation', () => {
  const app = setup(false);
  assert.equal(app.events.size, 0);
  assert.equal(app.entries.length, 1);
});
