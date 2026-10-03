// Общее управление полками карт и комнат. Сенсорный свайп остаётся нативным.
export function setupHorizontalShelf(shelf) {
  const view = shelf.ownerDocument.defaultView;
  let scrollTimer;
  let drag = null;
  let suppressClick = false;

  shelf.addEventListener('scroll', () => {
    shelf.classList.add('is-scrolling');
    view.clearTimeout(scrollTimer);
    scrollTimer = view.setTimeout(() => shelf.classList.remove('is-scrolling'), 180);
  }, { passive: true });

  shelf.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'touch' || event.button !== 0) return;
    suppressClick = false;
    drag = { pointerId: event.pointerId, x: event.clientX, left: shelf.scrollLeft, moved: false };
  }, true);
  shelf.addEventListener('pointermove', (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const distance = event.clientX - drag.x;
    if (!drag.moved && Math.abs(distance) < 6) return;
    if (!drag.moved) {
      drag.moved = true;
      suppressClick = true;
      shelf.setPointerCapture(event.pointerId);
      shelf.classList.add('is-dragging');
    }
    event.preventDefault();
    shelf.scrollLeft = drag.left - distance;
  }, true);
  function finishDrag(event) {
    if (!drag || drag.pointerId !== event.pointerId) return;
    drag = null;
    shelf.classList.remove('is-dragging');
    if (shelf.hasPointerCapture(event.pointerId)) shelf.releasePointerCapture(event.pointerId);
    view.setTimeout(() => { suppressClick = false; }, 0);
  }
  view.addEventListener('pointerup', finishDrag);
  view.addEventListener('pointercancel', finishDrag);
  shelf.addEventListener('lostpointercapture', finishDrag);
  shelf.addEventListener('click', (event) => {
    if (!suppressClick) return;
    event.preventDefault();
    event.stopPropagation();
  }, true);
  shelf.addEventListener('dragstart', (event) => event.preventDefault());
}
