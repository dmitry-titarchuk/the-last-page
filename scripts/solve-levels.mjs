import { levels } from '../src/levels.js';
import { directions, parseMap } from '../src/game.js';
import { pathToFileURL } from 'node:url';

export function solve(rows) {
  const map = parseMap(rows);
  const letters = { up: 'U', down: 'D', left: 'L', right: 'R' };
  const encode = ({ x, y }) => x + y * map.width;
  const floor = new Set([...map.floor].map((key) => {
    const [x, y] = key.split(',').map(Number);
    return encode({ x, y });
  }));
  const goals = new Set(map.goals.map(encode));
  const moves = Object.entries(directions).map(([name, { x, y }]) => ({ delta: x + y * map.width, letter: letters[name] }));
  const neighbors = new Map([...floor].map((cell) => [cell, moves.filter(({ delta }) =>
    floor.has(cell + delta) && (Math.abs(delta) !== 1 || Math.floor(cell / map.width) === Math.floor((cell + delta) / map.width)))]));

  // Обратный поиск от целей: клетки, откуда ящик может попасть на цель
  // без других ящиков. Толчки в остальные клетки создают тупик.
  const viable = new Set(goals);
  const backward = [...goals];
  for (let index = 0; index < backward.length; index++) {
    const cell = backward[index];
    for (const { delta } of neighbors.get(cell)) {
      const previous = cell + delta;
      if (!neighbors.get(previous)?.some((move) => move.delta === delta) || viable.has(previous)) continue;
      viable.add(previous);
      backward.push(previous);
    }
  }

  function reachable(player, boxes) {
    const occupied = new Set(boxes);
    const paths = new Map([[player, '']]);
    const pending = [player];
    for (let index = 0; index < pending.length; index++) {
      const cell = pending[index];
      for (const { delta, letter } of neighbors.get(cell)) {
        const next = cell + delta;
        if (occupied.has(next) || paths.has(next)) continue;
        paths.set(next, paths.get(cell) + letter);
        pending.push(next);
      }
    }
    return paths;
  }
  const initial = { player: encode(map.initial.player), boxes: map.initial.boxes.map(encode).sort((a, b) => a - b), path: '' };
  const stateKey = (state, paths) => `${state.boxes.join(',')}|${Math.min(...paths.keys())}`;
  const queue = [initial];
  const seen = new Set([stateKey(initial, reachable(initial.player, initial.boxes))]);
  // Обход в ширину по толчкам. Позиции героя в одной доступной области
  // эквивалентны; в решении сохраняются и обходы, и сами толчки.
  for (let index = 0; index < queue.length; index++) {
    const state = queue[index];
    if (state.boxes.every((cell) => goals.has(cell))) return state.path;
    const paths = reachable(state.player, state.boxes);
    const occupied = new Set(state.boxes);
    for (const box of state.boxes) for (const { delta, letter } of neighbors.get(box)) {
      const destination = box + delta;
      const approach = box - delta;
      if (!paths.has(approach) || !neighbors.get(approach)?.some((move) => move.delta === delta)
        || occupied.has(destination) || !viable.has(destination)) continue;
      const next = {
        player: box,
        boxes: state.boxes.map((cell) => cell === box ? destination : cell).sort((a, b) => a - b),
        path: state.path + paths.get(approach) + letter,
      };
      const key = stateKey(next, reachable(next.player, next.boxes));
      if (!seen.has(key)) {
        seen.add(key);
        queue.push(next);
      }
    }
  }
  return null;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const level of levels) {
    const solution = solve(level.map);
    if (solution === null) throw new Error(`Нет решения: ${level.title}`);
    console.log(`${level.title}: ${solution.length} ходов — ${solution}`);
  }
}
