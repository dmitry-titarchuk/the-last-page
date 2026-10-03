import { cellKey, directions, isComplete } from './game.js';

const offset = (point, delta, amount = 1) => ({ x: point.x + delta.x * amount, y: point.y + delta.y * amount });

// Обратные толчки учитывают место для героя за сундуком. Поэтому стена
// сама по себе не тупик: вдоль неё может быть достижимая цель.
export function viableBoxCells(map) {
  const viable = new Set(map.goals.map(cellKey));
  const queue = [...map.goals];
  for (let i = 0; i < queue.length; i++) {
    for (const delta of Object.values(directions)) {
      const previous = offset(queue[i], delta, -1);
      const support = offset(queue[i], delta, -2);
      const key = cellKey(previous);
      if (map.floor.has(key) && map.floor.has(cellKey(support)) && !viable.has(key)) {
        viable.add(key);
        queue.push(previous);
      }
    }
  }
  return viable;
}

function reachable(map, state) {
  const occupied = new Set(state.boxes.map(cellKey));
  const cells = new Set([cellKey(state.player)]);
  const queue = [state.player];
  for (let i = 0; i < queue.length; i++) for (const delta of Object.values(directions)) {
    const point = offset(queue[i], delta);
    const key = cellKey(point);
    if (map.floor.has(key) && !occupied.has(key) && !cells.has(key)) {
      cells.add(key);
      queue.push(point);
    }
  }
  return cells;
}

export class Guidance {
  constructor(map) {
    this.map = map;
    this.viable = viableBoxCells(map);
    this.cache = new Map();
  }

  stoneBoxes(state) {
    const frozen = this.frozenBoxes(state);
    const goals = new Set(this.map.goals.map(cellKey));
    return state.boxes.map((box, index) => !this.viable.has(cellKey(box))
      || (frozen[index] && !goals.has(cellKey(box))));
  }

  frozenBoxes(state) {
    // Убираем из неподвижной группы все сундуки, которым можно освободить
    // проход. Оставшиеся блокируют друг друга даже после перемещения остальных.
    // Доступ героя не учитываем: необходимость обойти сундук ещё не тупик.
    const frozen = new Set(state.boxes.map(cellKey));
    const free = (point) => this.map.floor.has(cellKey(point)) && !frozen.has(cellKey(point));
    let changed;
    do {
      changed = false;
      for (const box of state.boxes) {
        const key = cellKey(box);
        if (frozen.has(key) && Object.values(directions).some((delta) =>
          free(offset(box, delta)) && free(offset(box, delta, -1)))) {
          frozen.delete(key);
          changed = true;
        }
      }
    } while (changed);
    return state.boxes.map((box) => frozen.has(cellKey(box)));
  }

  // Поиск по толчкам, позиции героя в одной доступной области эквивалентны.
  // Подсказки нужны только маленьким учебным уровням; лимит защищает кадр.
  hint(state) {
    if (this.stoneBoxes(state).some(Boolean)) return null;
    const stateKey = (current, cells) => `${current.boxes.map(cellKey).join(';')}|${[...cells].sort()[0]}`;
    const initialCells = reachable(this.map, state);
    const initialKey = stateKey(state, initialCells);
    if (this.cache.has(initialKey)) return this.cache.get(initialKey);
    const queue = [{ ...state, parent: null, push: null, cells: initialCells }];
    const seen = new Set([initialKey]);
    let solution = null;
    for (let i = 0; i < queue.length && queue.length <= 20000; i++) {
      const current = queue[i];
      if (isComplete(this.map, current)) { solution = current; break; }
      const occupied = new Set(current.boxes.map(cellKey));
      current.boxes.forEach((box, boxIndex) => {
        for (const [direction, delta] of Object.entries(directions)) {
          const destination = offset(box, delta);
          const key = cellKey(destination);
          if (!current.cells.has(cellKey(offset(box, delta, -1)))
            || occupied.has(key) || !this.viable.has(key)) continue;
          const next = { player: box, boxes: current.boxes.map((point, index) => index === boxIndex ? destination : point),
            parent: current, push: { boxIndex, direction, destination } };
          next.cells = reachable(this.map, next);
          const nextKey = stateKey(next, next.cells);
          if (!seen.has(nextKey)) { seen.add(nextKey); queue.push(next); }
        }
      });
    }
    const pushes = [];
    for (let node = solution; node?.push; node = node.parent) pushes.push(node.push);
    pushes.reverse();
    let hint = null;
    if (pushes.length) {
      const first = pushes[0];
      const path = [{ ...state.boxes[first.boxIndex] }];
      const visited = new Set(path.map(cellKey));
      // Один этап заканчивается при переключении на другой сундук,
      // развороте назад или возвращении в клетку своего маршрута.
      // Обычные повороты и обход героя продолжают тот же этап.
      for (const push of pushes) {
        const key = cellKey(push.destination);
        if (push.boxIndex !== first.boxIndex || visited.has(key)) break;
        path.push({ ...push.destination });
        visited.add(key);
      }
      hint = { boxIndex: first.boxIndex, from: path[0], to: path.at(-1), path };
    }
    this.cache.set(initialKey, hint);
    return hint;
  }
}
