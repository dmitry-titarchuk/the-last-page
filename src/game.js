export const directions = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export const cellKey = ({ x, y }) => `${x},${y}`;
const copy = (state) => ({
  player: { ...state.player },
  boxes: state.boxes.map((box) => ({ ...box })),
  moves: state.moves,
});

export function parseMap(rows) {
  if (!rows.length || !rows.some((row) => row.length)) {
    throw new Error('Карта должна быть непустой.');
  }
  const floor = new Set();
  const walls = [];
  const goals = [];
  const boxes = [];
  let player;
  rows.forEach((row, y) => [...row].forEach((symbol, x) => {
    const point = { x, y };
    if (!'# @$.*+'.includes(symbol)) throw new Error(`Неизвестный символ: ${symbol}`);
    if (symbol === '#') walls.push(point);
    else floor.add(cellKey(point));
    if ('.*+'.includes(symbol)) goals.push(point);
    if ('$*'.includes(symbol)) boxes.push(point);
    if ('@+'.includes(symbol)) {
      if (player) throw new Error('На карте должен быть один герой.');
      player = point;
    }
  }));
  if (!player || !boxes.length || boxes.length !== goals.length) {
    throw new Error('Нужны один герой и одинаковое ненулевое число ящиков и целей.');
  }
  const width = Math.max(...rows.map((row) => row.length));
  const height = rows.length;
  // В .sok пробел обозначает и пол, и пустоту снаружи. Пол комнаты
  // связан с героем; ящики при этом считаются проходимыми для разбора.
  const connected = new Set();
  const pending = [player];
  for (let index = 0; index < pending.length; index++) {
    const point = pending[index];
    const key = cellKey(point);
    if (connected.has(key) || !floor.has(key)) continue;
    connected.add(key);
    for (const delta of Object.values(directions)) {
      pending.push({ x: point.x + delta.x, y: point.y + delta.y });
    }
  }
  if ([...boxes, ...goals].some((point) => !connected.has(cellKey(point)))) {
    throw new Error('Все ящики и цели должны находиться в области комнаты, связанной с героем.');
  }
  const exterior = new Set();
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const key = cellKey({ x, y });
    const symbol = rows[y][x];
    if (symbol === undefined || (symbol === ' ' && !connected.has(key))) {
      exterior.add(key);
      floor.delete(key);
    }
  }
  return { width, height, floor, walls, exterior, goals, initial: { player, boxes, moves: 0 } };
}

// Углы принадлежат одной стороне. Правая сторона приоритетна, чтобы
// ближний правый угол оставался низким, как на прямоугольных картах.
export function perimeterSide(map, { x, y }) {
  if (x === map.width - 1) return 'right';
  if (y === 0) return 'top';
  if (y === map.height - 1) return 'bottom';
  if (x === 0) return 'left';
  for (const [side, dx, dy] of [['right', 1, 0], ['top', 0, -1], ['bottom', 0, 1], ['left', -1, 0]]) {
    if (map.exterior?.has(cellKey({ x: x + dx, y: y + dy }))) return side;
  }
  return null;
}

export function isComplete(map, state) {
  return map.goals.every((goal) => state.boxes.some((box) => cellKey(box) === cellKey(goal)));
}

// Чистая функция: исходное состояние не изменяется, недопустимый ход возвращает null.
export function step(map, state, direction) {
  const delta = directions[direction];
  if (!delta) return null;
  const target = { x: state.player.x + delta.x, y: state.player.y + delta.y };
  if (!map.floor.has(cellKey(target))) return null;
  const boxIndex = state.boxes.findIndex((box) => cellKey(box) === cellKey(target));
  const next = copy(state);
  if (boxIndex !== -1) {
    const beyond = { x: target.x + delta.x, y: target.y + delta.y };
    if (!map.floor.has(cellKey(beyond)) || state.boxes.some((box) => cellKey(box) === cellKey(beyond))) return null;
    next.boxes[boxIndex] = beyond;
  }
  next.player = target;
  next.moves += 1;
  return next;
}

export class Game {
  constructor(rows) {
    this.map = parseMap(rows);
    this.restart();
  }

  get state() { return copy(this.current); }
  get complete() { return isComplete(this.map, this.current); }
  get canUndo() { return this.history.length > 0; }

  move(direction) {
    if (this.complete) return false;
    const next = step(this.map, this.current, direction);
    if (!next) return false;
    this.history.push(this.current);
    this.current = next;
    return true;
  }

  undo() {
    if (!this.canUndo) return false;
    this.current = this.history.pop();
    return true;
  }

  restart() {
    this.current = copy(this.map.initial);
    this.history = [];
  }
}
