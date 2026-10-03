import test from 'node:test';
import assert from 'node:assert/strict';
import { setupHorizontalShelf } from '../src/horizontal-shelf.js';

function setup() {
  const view = new EventTarget();
  const timers = new Map();
  let timerId = 0;
  view.setTimeout = (callback) => { timers.set(++timerId, callback); return timerId; };
  view.clearTimeout = (id) => timers.delete(id);
  const shelf = new EventTarget();
  shelf.ownerDocument = { defaultView: view };
  shelf.classList = new Set();
  shelf.classList.remove = (name) => shelf.classList.delete(name);
  shelf.scrollLeft = 0;
  let captured;
  shelf.setPointerCapture = (id) => { captured = id; };
  shelf.hasPointerCapture = (id) => captured === id;
  shelf.releasePointerCapture = () => { captured = undefined; };
  setupHorizontalShelf(shelf);
  const send = (target, type, data = {}) => {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 100, ...data });
    target.dispatchEvent(event);
    return event;
  };
  const flush = () => {
    const callbacks = [...timers.values()];
    timers.clear();
    callbacks.forEach((callback) => callback());
  };
  return { shelf, view, send, flush };
}

test('перетаскивание прокручивает полку и подавляет выбор после отпускания', () => {
  const { shelf, view, send, flush } = setup();
  shelf.scrollLeft = 20;
  send(shelf, 'pointerdown');
  assert.equal(send(shelf, 'pointermove', { clientX: 97 }).defaultPrevented, false);
  assert.equal(shelf.scrollLeft, 20);
  assert.equal(send(shelf, 'pointermove', { clientX: 40 }).defaultPrevented, true);
  assert.equal(shelf.scrollLeft, 80);
  assert.ok(shelf.classList.has('is-dragging'));
  assert.ok(shelf.hasPointerCapture(1));
  send(view, 'pointerup');
  assert.ok(!shelf.classList.has('is-dragging'));
  assert.ok(!shelf.hasPointerCapture(1));
  assert.equal(send(shelf, 'click').defaultPrevented, true);
  flush();
  assert.equal(send(shelf, 'click').defaultPrevented, false);
});

test('обычный клик, сенсорный свайп и правая кнопка не запускают перетаскивание', () => {
  for (const data of [{}, { pointerType: 'touch' }, { button: 2 }]) {
    const { shelf, view, send } = setup();
    send(shelf, 'pointerdown', data);
    send(shelf, 'pointermove', { ...data, clientX: data.pointerType || data.button ? 40 : 98 });
    send(view, 'pointerup', data);
    assert.equal(shelf.scrollLeft, 0);
    assert.equal(send(shelf, 'click').defaultPrevented, false);
  }
});

test('отмена жеста освобождает захват, а индикатор появляется только при прокрутке', () => {
  const { shelf, view, send, flush } = setup();
  assert.ok(!shelf.classList.has('is-scrolling'));
  send(shelf, 'scroll');
  assert.ok(shelf.classList.has('is-scrolling'));
  flush();
  assert.ok(!shelf.classList.has('is-scrolling'));
  send(shelf, 'pointerdown');
  send(shelf, 'pointermove', { clientX: 40 });
  send(view, 'pointercancel');
  assert.ok(!shelf.hasPointerCapture(1));
  assert.ok(!shelf.classList.has('is-dragging'));
  assert.equal(send(shelf, 'dragstart').defaultPrevented, true);
});
