import { sceneConfig } from './config.js';
import { Game, cellKey, directions } from './game.js';
import { levels, playMap } from './levels.js';
import { RoomScene } from './scene.js';
import { renderIntroArtwork } from './intro.js';
import { setupBackNavigation } from './back-navigation.js';
import { setupHorizontalShelf } from './horizontal-shelf.js';
import { saveSession, readSession, restoreSession } from './session.js';
import { locations, locationLevels, locationAvailable, levelAvailable, resetLegacyProgress, readProgress, saveProgress, roomMiniature, mapArtwork } from './atlas.js';

const element = (id) => document.getElementById(id);
const stage = element('stage');
const menu = element('level-menu');
const intro = element('story-intro');
setupHorizontalShelf(element('map-shelf'));
setupHorizontalShelf(element('room-shelf'));

// visualViewport также учитывает изменение адресной строки в мобильных браузерах.
function updateViewport() {
  const viewport = window.visualViewport;
  const style = document.documentElement.style;
  style.setProperty('--viewport-width', `${viewport?.width ?? window.innerWidth}px`);
  style.setProperty('--viewport-height', `${viewport?.height ?? window.innerHeight}px`);
  style.setProperty('--viewport-left', `${viewport?.offsetLeft ?? 0}px`);
  style.setProperty('--viewport-top', `${viewport?.offsetTop ?? 0}px`);
}
updateViewport();
window.addEventListener('resize', updateViewport);
window.visualViewport?.addEventListener('resize', updateViewport);
window.visualViewport?.addEventListener('scroll', updateViewport);
let currentLevel = 0;
let game;
let scene;
let pendingDirection = null;
setupBackNavigation(window, document, () => {
  pendingDirection = null;
  scene?.cancelControls?.();
  // Обычно Chrome сам закрывает верхний dialog. Это также поддерживает
  // браузеры, которые передают Back прямо в историю страницы.
  [...document.querySelectorAll('dialog[open]')].at(-1)?.close();
});
function updateControls() {
  pendingDirection = null;
  scene?.cancelControls?.();
  if (scene) scene.controlsEnabled = !document.querySelector('dialog[open]') && element('error').hidden;
}
document.addEventListener('pwa-dialog-change', updateControls);
let storage;
try { storage = window.localStorage; } catch { /* Хранилище может быть недоступно. */ }
resetLegacyProgress(storage);
const completed = readProgress(storage);
const savedSession = readSession(storage);
let selectedLocation = null;

renderIntroArtwork(intro);
function openIntro() {
  pendingDirection = null;
  scene?.cancelControls?.();
  intro.showModal();
  updateControls();
  intro.scrollTop = 0;
  intro.focus({ preventScroll: true });
}
element('intro-start').addEventListener('click', () => intro.close());
element('intro-skip').addEventListener('click', () => intro.close());
element('intro-replay').addEventListener('click', openIntro);
intro.addEventListener('close', () => {
  updateControls();
  if (menu.open) element('intro-replay').focus({ preventScroll: true });
  else stage.focus({ preventScroll: true });
});
openIntro();

function renderShelf() {
  element('map-shelf').replaceChildren();
  locations.forEach((location, index) => {
    const rooms = locationLevels(location);
    const unfolded = rooms.length > 0 && locationAvailable(location, completed);
    const count = rooms.filter((room) => completed.has(room.id)).length;
    const button = document.createElement('button');
    button.disabled = !unfolded;
    button.className = `map-card ${unfolded ? 'unfolded' : 'rolled'}`;
    button.innerHTML = `${mapArtwork(location.motif, unfolded)}<span class="map-index">КАРТА ${String(index + 1).padStart(2, '0')}</span><span class="map-title">${location.title}</span><span class="map-genre">${location.genre}</span><span class="map-state">${unfolded ? `${count} / ${rooms.length} комнат пройдено · Открыть` : 'Свиток запечатан · Пройдите предыдущую карту'}</span>`;
    button.addEventListener('click', () => showLocation(location));
    element('map-shelf').append(button);
  });
}

function showAtlas() {
  selectedLocation = null;
  element('atlas-view').hidden = false;
  element('location-view').hidden = true;
  renderShelf();
}

function showLocation(location) {
  if (!locationAvailable(location, completed)) return;
  selectedLocation = location;
  element('atlas-view').hidden = true;
  element('location-view').hidden = false;
  element('location-genre').textContent = location.genre;
  element('location-title').textContent = location.title;
  element('location-description').textContent = location.description;
  renderRoute();
  element('atlas-back').focus({ preventScroll: true });
}

function renderRoute() {
  if (!selectedLocation) return;
  const rooms = locationLevels(selectedLocation);
  const route = element('level-route');
  route.replaceChildren();
  element('location-empty').hidden = rooms.length > 0;
  element('route-legend').hidden = rooms.length === 0;
  route.parentElement.hidden = rooms.length === 0;
  element('route-progress').textContent = rooms.length ? `${rooms.filter((room) => completed.has(room.id)).length} / ${rooms.length} комнат восстановлено` : 'Уровни ещё не добавлены';
  rooms.forEach((room, index) => {
    const available = levelAvailable(selectedLocation, index, completed);
    const done = completed.has(room.id);
    const button = document.createElement('button');
    button.className = `route-room${done ? ' complete' : ''}${levels[currentLevel].id === room.id ? ' active' : ''}`;
    button.disabled = !available;
    const state = done ? 'Пройдена' : available ? 'Доступна' : 'Закрыта';
    button.setAttribute('aria-label', `${index + 1}. ${room.title}. ${state}${available ? '' : '. Пройдите предыдущую комнату'}`);
    if (levels[currentLevel].id === room.id) button.setAttribute('aria-current', 'step');
    button.innerHTML = `<span class="room-miniature">${roomMiniature(playMap(room))}</span><span class="route-number">${String(index + 1).padStart(2, '0')}</span><span class="route-title">${room.title}</span><span class="route-state">${done ? '✓ Пройдена' : available ? '○ Доступна' : '<svg viewBox="0 0 16 18" aria-hidden="true"><path d="M4 7V5a4 4 0 0 1 8 0v2M2 7h12v9H2z" fill="none" stroke="currentColor" stroke-width="2"/></svg> Закрыта'}</span>`;
    button.addEventListener('click', () => {
      if (!levelAvailable(selectedLocation, index, completed)) return;
      closeMenu();
      loadLevel(levels.indexOf(room));
    });
    route.append(button);
  });
}

function selectedJourneyLocation() {
  return locations.find((item) => item.levelIds.includes(levels[currentLevel].id));
}

function currentJourney() {
  const location = locations.find((item) => item.levelIds.includes(levels[currentLevel].id));
  const rooms = location ? locationLevels(location) : levels;
  return { rooms, index: rooms.indexOf(levels[currentLevel]) };
}

function showError(message) {
  pendingDirection = null;
  scene?.cancelControls?.();
  element('error').textContent = message;
  element('error').hidden = false;
  updateControls();
}

function update() {
  saveSession(storage, levels[currentLevel].id, game);
  const state = game.state;
  const count = game.map.goals.filter((goal) => state.boxes.some((box) => cellKey(box) === cellKey(goal))).length;
  element('goals').textContent = `${count} / ${game.map.goals.length}`;
  element('moves').textContent = state.moves;
  element('undo').disabled = !game.canUndo;
  element('victory').hidden = !(game.complete && scene.victoryReady);
  const hasStone = scene.guidance.stoneBoxes(state).some(Boolean);
  element('status').textContent = game.complete ? 'Все улики на своих местах'
    : hasStone ? 'Сундук в тупике — отмените ход или начните заново' : 'Верните улики на свои места';
  const journey = currentJourney();
  const lastRoom = journey.index === journey.rooms.length - 1;
  element('victory').classList.toggle('map-victory', lastRoom);
  element('victory-scroll').toggleAttribute('hidden', !lastRoom);
  element('victory-title').textContent = lastRoom ? 'Карта восстановлена!' : 'Комната восстановлена!';
  element('victory-text').textContent = lastRoom ? `Поздравляем! Все комнаты карты «${selectedJourneyLocation()?.title ?? 'История'}» пройдены. Улики восстановлены.` : 'Все улики на своих местах.';
  element('next').textContent = lastRoom ? (locations.indexOf(selectedJourneyLocation()) < locations.length - 1 ? 'Следующая карта' : 'Вернуться к картам') : 'Следующая комната';
  if (game.complete && !completed.has(levels[currentLevel].id)) {
    completed.add(levels[currentLevel].id);
    saveProgress(storage, completed);
  }
  if (menu.open) {
    if (selectedLocation) renderRoute();
    else renderShelf();
  }
}

function loadLevel(index, session = null) {
  pendingDirection = null;
  currentLevel = index;
  const level = levels[index];
  game = new Game(playMap(level));
  restoreSession(game, session);
  element('room-title').textContent = level.title;
  element('subtitle').textContent = level.subtitle;
  element('instruction').textContent = level.instruction + (index < 3
    ? ' Жёлтая стрелка ведёт сундук к полупрозрачному сундуку — временной позиции перед переходом к другому сундуку. Золотые отметки — конечные цели.' : '');
  const journey = currentJourney();
  element('room-number').textContent = `${String(journey.index + 1).padStart(2, '0')} / ${String(journey.rooms.length).padStart(2, '0')}`;
  scene.load(game.map, game.state, { tutorial: index < 3 });
  if (game.complete) scene.sync(game.state, true, { complete: true });
  update();
  if (!intro.open) stage.focus({ preventScroll: true });
}

function move(direction) {
  if (!game || document.querySelector('dialog[open]') || game.complete || !element('error').hidden) return;
  if (scene.busy) {
    pendingDirection = direction;
    return;
  }
  pendingDirection = null;
  const before = game.state;
  const delta = directions[direction];
  if (!delta) return;
  const target = { x: before.player.x + delta.x, y: before.player.y + delta.y };
  const pushing = before.boxes.some((box) => cellKey(box) === cellKey(target));
  if (game.move(direction)) {
    const state = game.state;
    const placedOnGoal = state.boxes.some((box, index) => cellKey(box) !== cellKey(before.boxes[index])
      && game.map.goals.some((goal) => cellKey(goal) === cellKey(box)));
    scene.sync(state, false, { action: pushing ? 'push' : 'walk', direction, complete: game.complete, placedOnGoal });
    update();
  } else {
    scene.blockedPush(direction, pushing);
  }
}

function undo() {
  if (document.querySelector('dialog[open]')) return;
  pendingDirection = null;
  if (game?.undo()) {
    scene.sync(game.state, false, { action: 'undo' });
    update();
  }
  stage.focus({ preventScroll: true });
}

function closeMenu() {
  menu.close();
}
element('menu-open').addEventListener('click', () => {
  pendingDirection = null;
  scene?.cancelControls?.();
  showAtlas();
  menu.showModal();
  updateControls();
  element('menu-open').setAttribute('aria-expanded', 'true');
  element('menu-close').focus({ preventScroll: true });
});
element('menu-close').addEventListener('click', closeMenu);
element('atlas-back').addEventListener('click', () => {
  const locationIndex = locations.indexOf(selectedLocation);
  showAtlas();
  element('map-shelf').children[locationIndex]?.focus({ preventScroll: true });
});
let backdropPressed = false;
const outsideMenu = (event) => {
  const rect = menu.getBoundingClientRect();
  return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
};
menu.addEventListener('pointerdown', (event) => { backdropPressed = event.target === menu && outsideMenu(event); });
menu.addEventListener('pointerup', (event) => {
  if (backdropPressed && event.target === menu && outsideMenu(event)) closeMenu();
  backdropPressed = false;
});
menu.addEventListener('pointercancel', () => { backdropPressed = false; });
menu.addEventListener('keydown', (event) => {
  if (event.key !== 'Tab') return;
  const buttons = [...menu.querySelectorAll('button:not(:disabled), [tabindex="0"]')].filter((node) => node.getClientRects().length > 0);
  const first = buttons[0];
  const last = buttons.at(-1);
  if ((event.shiftKey && document.activeElement === first)
    || (!event.shiftKey && document.activeElement === last)) {
    event.preventDefault();
    (event.shiftKey ? last : first)?.focus({ preventScroll: true });
  }
});
menu.addEventListener('close', () => {
  updateControls();
  element('menu-open').setAttribute('aria-expanded', 'false');
  element('menu-open').focus({ preventScroll: true });
});

try {
  scene = new RoomScene(stage);
  updateControls();
  window.gameDebug = {
    get floorDarkening() { return sceneConfig.floorDarkening; },
    set floorDarkening(value) { scene.setFloorDarkening(value); },
    get initialVerticalAngle() { return sceneConfig.initialVerticalAngle; },
    set initialVerticalAngle(value) {
      if (!Number.isFinite(Number(value))) return;
      sceneConfig.initialVerticalAngle = Math.max(15, Math.min(85, Number(value)));
      scene.verticalAngle = sceneConfig.initialVerticalAngle;
      scene.fitCamera();
    },
  };
  scene.onMove = move;
  scene.onVictory = update;
  scene.onIdle = () => {
    const direction = pendingDirection;
    pendingDirection = null;
    if (direction && !menu.open && !isEditing()) move(direction);
  };
  renderShelf();
  element('undo').addEventListener('click', undo);
  element('restart').addEventListener('click', () => {
    pendingDirection = null;
    game.restart();
    scene.sync(game.state, true);
    update();
    stage.focus({ preventScroll: true });
  });
  element('next').addEventListener('click', () => {
    if (!game.complete) return;
    const journey = currentJourney();
    if (journey.index + 1 < journey.rooms.length) {
      loadLevel(levels.indexOf(journey.rooms[journey.index + 1]));
    } else {
      const nextLocation = locations[locations.indexOf(selectedJourneyLocation()) + 1];
      if (nextLocation && locationAvailable(nextLocation, completed)) {
        showLocation(nextLocation);
        element('room-shelf').scrollLeft = 0;
        menu.showModal();
        updateControls();
        element('menu-open').setAttribute('aria-expanded', 'true');
      } else {
        showAtlas();
        menu.showModal();
        updateControls();
      }
    }
  });
  const keys = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
  document.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.altKey || event.metaKey || event.isComposing
      || document.querySelector('dialog[open]') || isEditing()) return;
    if (keys[event.code]) { event.preventDefault(); move(keys[event.code]); }
    if (event.code === 'KeyZ') { event.preventDefault(); undo(); }
  });
  document.addEventListener('focusin', () => {
    if (isEditing()) pendingDirection = null;
  });
  window.addEventListener('blur', () => { pendingDirection = null; scene.cancelControls(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { pendingDirection = null; scene.cancelControls(); }
  });
  scene.renderer.domElement.addEventListener('pointerdown', () => stage.focus({ preventScroll: true }));
  let victoryTap;
  stage.addEventListener('pointerdown', (event) => {
    victoryTap = game.complete && scene.action?.type === 'victory' && !event.target.closest('button')
      ? { id: event.pointerId, x: event.clientX, y: event.clientY } : null;
  });
  stage.addEventListener('pointerup', (event) => {
    if (victoryTap?.id === event.pointerId && Math.hypot(event.clientX - victoryTap.x, event.clientY - victoryTap.y) < 10) scene.finishVictory();
    victoryTap = null;
  });
  stage.addEventListener('pointercancel', () => { victoryTap = null; });
  stage.addEventListener('rendererror', (event) => showError(event.detail));
  stage.addEventListener('renderrestored', () => {
    element('error').hidden = true;
    updateControls();
    update();
  });
  const savedIndex = savedSession ? levels.findIndex((level) => level.id === savedSession.levelId) : -1;
  const savedLocation = savedIndex >= 0 ? locations.find((location) => location.levelIds.includes(savedSession.levelId)) : null;
  const canRestore = savedLocation && levelAvailable(savedLocation, locationLevels(savedLocation).findIndex((level) => level.id === savedSession.levelId), completed);
  loadLevel(canRestore ? savedIndex : 0, canRestore ? savedSession : null);
} catch (error) {
  console.error(error);
  showError('Не удалось запустить 3D-сцену. Если браузер заблокировал WebGL после сбоя, закройте вкладку и откройте игру заново. Также проверьте аппаратное ускорение и поддержку WebGL 2.');
  element('restart').disabled = true;
}

function isEditing() {
  const focused = document.activeElement;
  return focused?.matches('input, textarea, select') || focused?.isContentEditable;
}
