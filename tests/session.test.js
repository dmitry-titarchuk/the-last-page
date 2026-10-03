import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { saveSession, readSession, restoreSession } from '../src/session.js';

const map = ['#######', '#@ $ .#', '#######'];
const memory = () => {
  const data = new Map();
  return { setItem: (key, value) => data.set(key, value), getItem: (key) => data.get(key) };
};
test('session restores moves, boxes and undo history after reopening', () => {
  const storage = memory();
  const original = new Game(map);
  original.move('right');
  original.move('right');
  saveSession(storage, 'test-room', original);
  const saved = readSession(storage);
  assert.equal(saved.levelId, 'test-room');
  const restored = new Game(map);
  assert.equal(restoreSession(restored, saved), true);
  assert.deepEqual(restored.state, original.state);
  restored.undo();
  original.undo();
  assert.deepEqual(restored.state, original.state);
  saveSession(storage, 'test-room', original);
  assert.deepEqual(readSession(storage).moves, ['right']);
  original.restart();
  saveSession(storage, 'test-room', original);
  assert.deepEqual(readSession(storage).moves, []);
});
test('invalid moves cannot inject an impossible state', () => {
  const game = new Game(map);
  assert.equal(restoreSession(game, { moves: ['right', 'up'] }), false);
  assert.deepEqual(game.state, game.map.initial);
  assert.equal(game.canUndo, false);
});
test('unavailable or corrupt storage does not break the game', () => {
  const storage = { setItem() { throw Error('blocked'); }, getItem() { throw Error('blocked'); } };
  assert.doesNotThrow(() => saveSession(storage, 'test', new Game(map)));
  assert.equal(readSession(storage), null);
  for (const data of ['bad json', '{}', '{"levelId":"test","moves":["up","__proto__"]}']) {
    assert.equal(readSession({ getItem: () => data }), null);
  }
});
