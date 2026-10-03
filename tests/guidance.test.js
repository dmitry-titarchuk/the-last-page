import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, cellKey, directions, step } from '../src/game.js';
import { Guidance } from '../src/guidance.js';
import { levels, playMap } from '../src/levels.js';

function walkTo(game, target) {
  const queue = [{ state: game.state, path: [] }];
  const seen = new Set([cellKey(game.state.player)]);
  for (let i = 0; i < queue.length; i++) {
    const { state, path } = queue[i];
    if (cellKey(state.player) === cellKey(target)) {
      path.forEach((direction) => assert.ok(game.move(direction)));
      return;
    }
    for (const direction of Object.keys(directions)) {
      const next = step(game.map, state, direction);
      if (!next || next.boxes.some((box, index) => cellKey(box) !== cellKey(state.boxes[index]))) continue;
      const key = cellKey(next.player);
      if (!seen.has(key)) { seen.add(key); queue.push({ state: next, path: [...path, direction] }); }
    }
  }
  assert.fail('Не удалось подойти к сундуку');
}

test('Стрелки доводят первые три уровня до решения через промежуточные позиции', () => {
  for (const level of levels.slice(0, 3)) {
    const game = new Game(level.map);
    const guidance = new Guidance(game.map);
    for (let count = 0; !game.complete && count < 100; count++) {
      const hint = guidance.hint(game.state);
      assert.ok(hint, level.id);
      assert.deepEqual(hint.path[0], hint.from);
      assert.deepEqual(hint.path.at(-1), hint.to);
      assert.equal(new Set(hint.path.map(cellKey)).size, hint.path.length,
        'Один этап не возвращается в свои клетки и не накладывает стрелку на себя');
      for (const destination of hint.path.slice(1)) {
        const box = game.state.boxes[hint.boxIndex];
        const delta = { x: destination.x - box.x, y: destination.y - box.y };
        const direction = Object.keys(directions).find((name) => directions[name].x === delta.x && directions[name].y === delta.y);
        assert.ok(direction, 'Маршрут состоит из соседних клеток');
        walkTo(game, { x: box.x - delta.x, y: box.y - delta.y });
        assert.ok(game.move(direction));
      }
    }
    assert.ok(game.complete, level.id);
    assert.equal(guidance.hint(game.state), null);
  }
});

test('Ключевая позиция включает смену направления и заканчивается перед другим сундуком', () => {
  const game = new Game(levels[2].map);
  const guidance = new Guidance(game.map);
  const hint = guidance.hint(game.state);
  assert.equal(hint.boxIndex, 0);
  assert.deepEqual(hint.path, [{ x: 6, y: 2 }, { x: 5, y: 2 }, { x: 4, y: 2 }, { x: 3, y: 2 }, { x: 3, y: 3 }]);
  assert.deepEqual(hint.to, { x: 3, y: 3 }, 'Стрелка ведёт за поворот к позиции перед работой с другим сундуком');
  const second = new Game(levels[1].map);
  const secondHint = new Guidance(second.map).hint(second.state);
  assert.equal(secondHint.boxIndex, 2);
  assert.deepEqual(secondHint.to, { x: 2, y: 4 });
  assert.equal(secondHint.path.length, 2, 'Если нужно перейти к другому сундуку, ключевая позиция может быть соседней');
});

test('Разворот второго сундука на третьем уровне разбивается на два этапа', () => {
  const game = new Game(levels[2].map);
  const guidance = new Guidance(game.map);
  const state = { player: { x: 3, y: 2 }, boxes: [{ x: 3, y: 3 }, { x: 6, y: 3 }] };
  const beforeTurn = guidance.hint(state);
  assert.equal(beforeTurn.boxIndex, 1);
  assert.deepEqual(beforeTurn.path, [
    { x: 6, y: 3 }, { x: 6, y: 2 }, { x: 5, y: 2 }, { x: 4, y: 2 }, { x: 3, y: 2 },
  ]);
  const afterTurn = guidance.hint({
    player: beforeTurn.path.at(-2), boxes: [state.boxes[0], beforeTurn.to],
  });
  assert.equal(afterTurn.boxIndex, 1);
  assert.deepEqual(afterTurn.path, [{ x: 3, y: 2 }, { x: 4, y: 2 }]);
  assert.deepEqual(guidance.hint(state), beforeTurn, 'Возврат в предыдущее состояние восстанавливает этап');
});

test('После отклонения стрелка начинается с новой позиции, отмена восстанавливает подсказку', () => {
  const game = new Game(['########', '#      #', '# @$ . #', '#      #', '########']);
  const guidance = new Guidance(game.map);
  const original = guidance.hint(game.state);
  assert.deepEqual(original.to, { x: 5, y: 2 });
  walkTo(game, { x: 3, y: 3 });
  assert.ok(game.move('up'));
  // Верхняя стенка здесь тупиковая — для восстанавливаемого отклонения
  // используем просторную комнату ниже.
  assert.equal(guidance.hint(game.state), null);
  assert.ok(game.undo());
  assert.deepEqual(guidance.hint(game.state), original);
  const roomy = new Game(['########', '#      #', '#      #', '# @$ . #', '#      #', '#      #', '########']);
  const helper = new Guidance(roomy.map);
  const before = helper.hint(roomy.state);
  walkTo(roomy, { x: 3, y: 4 });
  assert.ok(roomy.move('up'));
  const rebuilt = helper.hint(roomy.state);
  assert.ok(rebuilt);
  assert.deepEqual(rebuilt.from, { x: 3, y: 2 });
  assert.notDeepEqual(rebuilt, before);
});

test('Каменными становятся углы и тупиковая стена, но не стена с доступной целью', () => {
  const blocked = new Game(['########', '# $    #', '# @  . #', '#      #', '########']);
  const guidance = new Guidance(blocked.map);
  assert.deepEqual(guidance.stoneBoxes(blocked.state), [true]);
  assert.deepEqual(guidance.stoneBoxes({ ...blocked.state, boxes: [{ x: 1, y: 1 }] }), [true]);
  const alongWall = new Game(['########', '# $  . #', '# @    #', '#      #', '########']);
  assert.deepEqual(new Guidance(alongWall.map).stoneBoxes(alongWall.state), [false]);
  assert.deepEqual(new Guidance(alongWall.map).stoneBoxes({ ...alongWall.state, boxes: alongWall.map.goals }), [false]);
});

test('На первом уровне сундук каменеет при взаимной блокировке у стены, отмена снимает тупик', () => {
  for (const rotated of [false, true]) {
    const game = new Game(rotated ? playMap(levels[0]) : levels[0].map);
    const guidance = new Guidance(game.map);
    const freeIndex = game.state.boxes.findIndex((box) => !game.map.goals.some((goal) => cellKey(goal) === cellKey(box)));
    const direction = rotated ? 'right' : 'left';
    walkTo(game, rotated ? { x: 1, y: 2 } : { x: 4, y: 4 });
    assert.ok(game.move(direction));
    assert.ok(game.move(direction));
    assert.deepEqual(guidance.frozenBoxes(game.state), [true, true]);
    assert.equal(guidance.stoneBoxes(game.state)[freeIndex], true);
    assert.ok(game.undo());
    assert.deepEqual(guidance.frozenBoxes(game.state), [false, false]);
    assert.equal(guidance.stoneBoxes(game.state)[freeIndex], false);
  }
});

test('Соседство и временно закрытый подход не означают окаменение; блок 2×2 неподвижен', () => {
  const game = new Game(['########', '# ..   #', '# $$ @ #', '#      #', '########']);
  const guidance = new Guidance(game.map);
  assert.deepEqual(guidance.frozenBoxes(game.state), [false, false]);
  assert.deepEqual(guidance.stoneBoxes(game.state), [false, false]);
  const block = new Game(['########', '# .... #', '# $$ @ #', '# $$   #', '#      #', '########']);
  const helper = new Guidance(block.map);
  assert.deepEqual(helper.frozenBoxes(block.state), [true, true, true, true]);
  assert.deepEqual(helper.stoneBoxes(block.state), [true, true, true, true]);
  assert.deepEqual(helper.stoneBoxes({ ...block.state, boxes: block.map.goals }), [false, false, false, false]);
});
