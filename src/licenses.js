const documents = new Map([
  ['LICENSE', 'PolyForm Noncommercial 1.0.0'],
  ['NOTICE', 'Авторское уведомление'],
  ['THIRD_PARTY_NOTICES.txt', 'Сторонние материалы'],
  ['node_modules/three/LICENSE', 'Лицензия MIT — Three.js'],
]);
const dialog = document.getElementById('licenses-dialog');
const content = document.getElementById('licenses-content');
const back = document.getElementById('licenses-back');
let overview;
let request = 0;
const notify = () => document.dispatchEvent(new Event('pwa-dialog-change'));

async function render(file) {
  const current = ++request;
  content.textContent = 'Загрузка документа…';
  try {
    if (file && documents.has(file)) {
      const response = await fetch(new URL(`../${file}`, import.meta.url));
      if (!response.ok) throw new Error('Document unavailable');
      const text = await response.text();
      if (current !== request) return;
      const title = document.createElement('h1');
      title.textContent = documents.get(file);
      const body = document.createElement('pre');
      body.textContent = text;
      content.replaceChildren(title, body);
    } else {
      if (!overview) {
        const response = await fetch(new URL('../licensing.html', import.meta.url));
        if (!response.ok) throw new Error('Licenses unavailable');
        overview = new DOMParser().parseFromString(await response.text(), 'text/html').querySelector('main').innerHTML;
      }
      if (current !== request) return;
      content.innerHTML = overview;
      content.querySelector('[data-return-game]')?.remove();
    }
  } catch {
    if (current === request) content.textContent = 'Не удалось открыть документ. Проверьте соединение и попробуйте ещё раз.';
  }
  if (current === request) {
    (dialog ?? document.documentElement).scrollTop = 0;
    back.focus({ preventScroll: true });
  }
}
function navigate(file = null) {
  history.pushState({ ...history.state, libraryLegal: true, document: file }, '', file ? `#document=${encodeURIComponent(file)}` : '#licenses');
  void render(file);
}
content.addEventListener('click', (event) => {
  const link = event.target.closest('a');
  if (!link) return;
  const file = decodeURIComponent(link.hash.replace(/^#document=/, ''));
  if (!documents.has(file)) return;
  event.preventDefault();
  navigate(file);
});
back.addEventListener('click', () => {
  if (history.state?.libraryLegal) history.back();
  else location.href = './index.html';
});
window.addEventListener('popstate', () => {
  if (history.state?.libraryLegal) {
    if (dialog && !dialog.open) { dialog.showModal(); notify(); }
    void render(history.state.document);
  } else if (dialog?.open) {
    ++request;
    dialog.close();
  } else if (!dialog) {
    ++request;
    void render(null);
  }
});
if (dialog) {
  document.getElementById('licenses-open').addEventListener('click', () => {
    dialog.showModal();
    notify();
    navigate();
  });
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); history.back(); });
  dialog.addEventListener('close', () => {
    notify();
    document.getElementById('licenses-open').focus({ preventScroll: true });
  });
} else {
  const file = decodeURIComponent(location.hash.replace(/^#document=/, ''));
  void render(history.state?.libraryLegal ? history.state.document : documents.has(file) ? file : null);
}
