import { directions } from './game.js';

const KEY = 'library-game-session-v1';
// Сохраняем реальные ходы, чтобы восстановить и позицию, и историю отмены.
export function saveSession(storage, levelId, game) {
  const states = [...game.history, game.state];
  const moves = states.slice(1).map((state, index) => {
    const before = states[index].player;
    return Object.keys(directions).find((name) => {
      const delta = directions[name];
      return state.player.x - before.x === delta.x && state.player.y - before.y === delta.y;
    });
  });
  try { storage?.setItem(KEY, JSON.stringify({ levelId, moves })); } catch { /* Игра доступна и без хранилища. */ }
}
export function readSession(storage) {
  try {
    const data = JSON.parse(storage?.getItem(KEY) ?? 'null');
    if (typeof data?.levelId !== 'string' || !Array.isArray(data.moves) || data.moves.length > 100000
      || !data.moves.every((name) => Object.hasOwn(directions, name))) return null;
    return data;
  } catch { return null; }
}
export function restoreSession(game, session) {
  if (!session) return false;
  for (const move of session.moves) {
    if (!game.move(move)) {
      game.restart();
      return false;
    }
  }
  return true;
}
