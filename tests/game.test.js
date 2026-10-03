import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, parseMap, step, isComplete, cellKey } from '../src/game.js';
import { levels, playMap } from '../src/levels.js';
import { solve } from '../scripts/solve-levels.mjs';
import { readFileSync } from 'node:fs';

test('Карты с изолированными ящиками или целями отклоняются', () => {
  assert.throws(() => parseMap(['#######', '#@ $.##', '#######', '# $ . #', '#######']), /связанной с героем/);
  assert.throws(() => parseMap(['#######', '#@ $ ##', '#######', '#   . #', '#######']), /связанной с героем/);
  assert.throws(() => parseMap(['#######', '#@  .##', '#######', '# $   #', '#######']), /связанной с героем/);
});

const directions = { U: 'up', D: 'down', L: 'left', R: 'right' };

test('Первый уровень повёрнут на 180° и решается теми же ходами в обратных направлениях', () => {
  const original = new Game(levels[0].map);
  const game = new Game(playMap(levels[0]));
  const rotated = ({ x, y }) => ({ x: game.map.width - 1 - x, y: game.map.height - 1 - y });
  assert.deepEqual(game.state.player, rotated(original.state.player));
  assert.deepEqual(game.state.boxes.map(cellKey).sort(), original.state.boxes.map(rotated).map(cellKey).sort());
  const inverse = { U: 'down', D: 'up', L: 'right', R: 'left' };
  for (const letter of solve(levels[0].map)) assert.ok(game.move(inverse[letter]));
  assert.ok(game.complete);
  for (const level of levels.slice(1)) assert.equal(playMap(level), level.map);
});

test('схемы Microban совпадают с оригиналом, включая пробелы и длины строк', () => {
  const source = readFileSync(new URL('../DavidWSkinner Microban.sok', import.meta.url), 'latin1').replace(/\r/g, '');
  assert.equal(levels.length, 35);
  assert.deepEqual(levels.map((level) => level.source.number), Array.from({ length: 35 }, (_, i) => i + 1));
  for (const level of levels) {
    const match = source.match(new RegExp(`(?:^|\\n)${level.source.number}\\n([ #@$.+*\\n]+?)\\nTitle:`));
    assert.ok(match);
    assert.deepEqual(level.map, match[1].split('\n'));
  }
});

test('решатель распознаёт тупики и не переносит толчки через край строки', () => {
  assert.equal(solve(['@  ', '$ .']), null);
  assert.equal(solve(['#####', '#$@.#', '#####']), null);
  assert.equal(solve(['#####', '#@* #', '#####']), '');
  assert.equal(solve(['@$ .']), 'RR');
});

test('строки разной длины и внешние пробелы не создают пол или стены', () => {
  const game = new Game(['  ###', '### .#', '#@$  #', '#    #', '######']);
  assert.equal(game.map.width, 6);
  assert.equal(game.map.floor.has('0,0'), false);
  assert.equal(game.map.walls.some(({ x, y }) => x === 0 && y === 0), false);
  assert.equal(game.map.floor.has('4,2'), true);
  assert.equal(game.move('up'), false);
  assert.equal(game.move('right'), true);
  assert.equal(game.move('right'), true);
  assert.equal(game.move('down'), true);
  assert.equal(game.move('right'), true);
  assert.equal(game.move('up'), true);
  assert.equal(game.complete, true);
});

for (const level of levels) {
  test(`${level.title}: решение, отмена всего прохождения и перезапуск`, () => {
    const game = new Game(level.map);
    const initial = game.state;
    const solution = solve(level.map);
    assert.ok(solution, 'Карта должна иметь решение');
    const snapshots = [initial];
    for (const letter of solution) {
      assert.equal(game.move(directions[letter]), true);
      const state = game.state;
      assert.ok(game.map.floor.has(cellKey(state.player)));
      assert.ok(state.boxes.every((box) => game.map.floor.has(cellKey(box))));
      assert.equal(new Set(state.boxes.map(cellKey)).size, state.boxes.length);
      assert.ok(!state.boxes.some((box) => cellKey(box) === cellKey(state.player)));
      snapshots.push(state);
    }
    assert.equal(game.complete, true);
    assert.equal(game.move('left'), false, 'После победы движение остановлено');
    for (let index = snapshots.length - 2; index >= 0; index--) {
      assert.equal(game.undo(), true);
      assert.deepEqual(game.state, snapshots[index]);
    }
    assert.deepEqual(game.state, initial);
    assert.equal(game.undo(), false);
    assert.equal(game.canUndo, false);
    for (const letter of solution) game.move(directions[letter]);
    game.restart();
    assert.deepEqual(game.state, initial);
    assert.equal(game.complete, false);
    assert.equal(game.canUndo, false);
  });
}

test('Стены, границы карты и цепочка ящиков блокируют ход без изменения состояния', () => {
  const chain = new Game(['#######', '#@$$..#', '#######']);
  const initial = chain.state;
  for (const direction of ['up', 'down', 'left', 'right', 'unknown']) {
    assert.equal(chain.move(direction), false);
    assert.deepEqual(chain.state, initial);
    assert.equal(chain.canUndo, false);
  }
  const wall = new Game(['#####', '#@$##', '# . #', '#####']);
  assert.equal(wall.move('right'), false);
  const openEdge = new Game(['@$ .']);
  assert.equal(openEdge.move('left'), false);
  assert.equal(openEdge.move('up'), false);
});

test('Ящики не тянутся вслед за героем, снимки не позволяют изменить состояние игры', () => {
  const game = new Game(['######', '# $@.#', '#    #', '######']);
  const boxes = game.state.boxes;
  assert.equal(game.move('right'), true);
  assert.deepEqual(game.state.boxes, boxes);
  const snapshot = game.state;
  snapshot.player.x = -100;
  snapshot.boxes[0].x = -100;
  assert.notEqual(game.state.player.x, -100);
  assert.notEqual(game.state.boxes[0].x, -100);
});

test('Победа требует всех целей, чистая функция хода не меняет исходное состояние', () => {
  const map = parseMap(['#######', '#@* $.#', '#     #', '#######']);
  assert.equal(isComplete(map, map.initial), false);
  const before = structuredClone(map.initial);
  const next = step(map, map.initial, 'down');
  assert.ok(next);
  assert.deepEqual(map.initial, before);
  const full = parseMap(['#####', '#@**#', '#####']);
  assert.equal(isComplete(full, full.initial), true);
});

test('Загрузчик отклоняет некорректные карты', () => {
  for (const rows of [[], [''], ['##', '#'], ['#@?.$#'], ['#@@$.#'], ['#@$$.#'], ['# $. #']]) {
    assert.throws(() => parseMap(rows));
  }
});
