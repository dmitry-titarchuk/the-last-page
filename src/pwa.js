const dialog = document.getElementById('pwa-install-dialog');
const confirm = document.getElementById('pwa-install-confirm');
const description = document.getElementById('pwa-install-description');
const update = document.getElementById('pwa-update');
const buttons = [...document.querySelectorAll('[data-pwa-install]')];
const standalone = window.matchMedia('(display-mode: standalone)');
const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const mobile = ios || /Android/.test(navigator.userAgent);
let installEvent;
let registration;
let offlineReady = false;
let installed = standalone.matches || navigator.standalone === true;
let offered = false;
let reloading = false;
let hadController = Boolean(navigator.serviceWorker?.controller);
let dismissedUntil = 0;
try { dismissedUntil = Number(localStorage.getItem('library-install-dismissed-until')) || 0; } catch { /* Optional preference. */ }

function status(message) {
  document.querySelectorAll('[data-pwa-status]').forEach((node) => { node.textContent = message; });
}
function connectionStatus() {
  if (!offlineReady) return;
  status(navigator.onLine ? 'Все 35 комнат сохранены — можно играть офлайн.' : 'Вы офлайн. Все 35 комнат доступны, прогресс сохраняется.');
}
function renderInstall() {
  buttons.forEach((button) => {
    button.hidden = installed;
    button.textContent = installEvent ? 'Установить приложение' : 'Как установить приложение';
  });
  document.querySelector('.pwa-intro-offer').hidden = installed || !(installEvent || (ios && window.isSecureContext));
}
function openInstall() {
  if (installed || dialog.open) return;
  description.textContent = installEvent
    ? 'Установите приложение: свой значок, отдельное окно и все 35 комнат без интернета.'
    : !window.isSecureContext
      ? 'Для установки и игры офлайн откройте игру по HTTPS. Обычный HTTP-адрес в локальной сети не поддерживает установку приложения.'
      : ios
        ? 'Откройте меню «Поделиться» → «На экран Домой» → «Добавить». Если есть переключатель «Открывать как веб-приложение», оставьте его включённым. Игра будет запускаться в отдельном окне.'
        : 'Откройте меню браузера → «Установить приложение». Если доступен только ярлык, дождитесь подготовки офлайн-игры или откройте сайт в Chrome на Android. Возможность установки определяет браузер.';
  confirm.hidden = !installEvent;
  dialog.showModal();
  document.dispatchEvent(new Event('pwa-dialog-change'));
}
function offerInstall() {
  renderInstall();
  if (installed || offered || !mobile || !(installEvent || (ios && window.isSecureContext))
    || dismissedUntil > Date.now() || document.querySelector('dialog[open]')) return;
  offered = true;
  openInstall();
}
function dismiss() {
  dismissedUntil = Date.now() + 7 * 24 * 60 * 60 * 1000;
  try { localStorage.setItem('library-install-dismissed-until', String(dismissedUntil)); } catch { /* Optional preference. */ }
}
buttons.forEach((button) => button.addEventListener('click', openInstall));
document.getElementById('pwa-install-later').addEventListener('click', () => { dismiss(); dialog.close(); });
dialog.addEventListener('cancel', dismiss);
dialog.addEventListener('close', () => document.dispatchEvent(new Event('pwa-dialog-change')));
// После пролога предложение доступно также в отдельном окне; меню остаётся доступным всегда.
for (const other of document.querySelectorAll('dialog:not(#pwa-install-dialog)')) {
  other.addEventListener('close', () => setTimeout(offerInstall, 0));
}
confirm.addEventListener('click', async () => {
  if (!installEvent) return;
  const pending = installEvent;
  installEvent = null;
  confirm.disabled = true;
  try {
    await pending.prompt();
    const result = await pending.userChoice;
    if (result.outcome === 'dismissed') dismiss();
    if (result.outcome === 'accepted') {
      // Запрашиваем защиту сохранений/кеша от вытеснения после явного действия пользователя.
      void navigator.storage?.persist?.().catch(() => {});
    }
  } catch {
    status('Не удалось открыть установку. Попробуйте через меню браузера.');
  } finally {
    confirm.disabled = false;
    dialog.close();
    renderInstall();
  }
});
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installEvent = event;
  offerInstall();
});
window.addEventListener('appinstalled', () => {
  installed = true;
  installEvent = null;
  if (dialog.open) dialog.close();
  renderInstall();
});
standalone.addEventListener('change', () => {
  installed = standalone.matches || navigator.standalone === true;
  renderInstall();
});
window.addEventListener('online', connectionStatus);
window.addEventListener('offline', connectionStatus);

function showUpdate() { update.hidden = !registration?.waiting; }
update.addEventListener('click', () => {
  if (!registration?.waiting) return;
  update.disabled = true;
  registration.waiting.postMessage({ type: 'SKIP_WAITING' });
});
if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Первый запуск не перезагружаем. Новая версия открывается после активации.
    if (hadController && !reloading) {
      reloading = true;
      location.reload();
    }
    hadController = true;
  });
  navigator.serviceWorker.register(new URL('../sw.js', import.meta.url), { updateViaCache: 'none' }).then(async (worker) => {
    registration = worker;
    showUpdate();
    worker.addEventListener('updatefound', () => {
      const installing = worker.installing;
      installing?.addEventListener('statechange', () => {
        if (installing.state === 'installed') showUpdate();
        if (installing.state === 'redundant' && !offlineReady) status('Не удалось сохранить игру офлайн. Проверьте соединение и перезагрузите страницу.');
      });
    });
    await navigator.serviceWorker.ready;
    offlineReady = true;
    connectionStatus();
  }).catch((error) => {
    console.error('PWA registration failed', error);
    status('Офлайн-режим не подготовлен. Проверьте соединение и перезагрузите страницу.');
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && navigator.onLine) void registration?.update().catch(() => {});
  });
} else {
  status(window.isSecureContext ? 'Этот браузер не поддерживает офлайн-режим.' : 'Для установки и офлайн-игры нужен HTTPS.');
}
renderInstall();
// Модули выполняются до показа пролога: даём app.js закончить инициализацию.
setTimeout(offerInstall, 0);
