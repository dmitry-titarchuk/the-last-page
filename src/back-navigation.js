// В установленной PWA системный Back должен оставаться внутри игры.
// В обычной вкладке сохраняем стандартную навигацию браузера.
export function setupBackNavigation(window, document, onBack) {
  if (!window.matchMedia('(display-mode: standalone)').matches
    && !window.matchMedia('(display-mode: fullscreen)').matches
    && !window.navigator.standalone) return;

  const marker = 'lastPageBackGuard';
  const arm = () => {
    if (window.history.state?.[marker] === 'active') return;
    window.history.replaceState({ ...window.history.state, [marker]: 'base' }, '');
    window.history.pushState({ ...window.history.state, [marker]: 'active' }, '');
  };
  // Создаём запись при взаимодействии: Chrome может пропустить записи,
  // созданные страницей, с которой пользователь ещё не взаимодействовал.
  document.addEventListener('pointerdown', arm, { capture: true });
  document.addEventListener('keydown', arm, { capture: true });
  document.addEventListener('close', arm, { capture: true });
  window.addEventListener('popstate', (event) => {
    if (event.state?.[marker] !== 'base') return;
    arm();
    onBack();
  });
}
