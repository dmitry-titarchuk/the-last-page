import { levels } from './levels.js';
import { parseMap } from './game.js';

// Добавляйте ID комнат в нужную локацию; длина маршрута определяется данными.
export const locations = [
  { id: 'rain-city', title: 'Дождливый город', genre: 'Детективная книга', description: 'Следы хранителя ведут через кабинет сыщика, архив и комнату свидетельств.', levelIds: ['microban-01', 'microban-02', 'microban-03', 'microban-04', 'microban-05', 'microban-06', 'microban-07'], motif: 'city' },
  { id: 'islands', title: 'Затерянные острова', genre: 'Морское приключение', description: 'Порт, острова и затонувшие залы хранят путь к запретному разделу.', levelIds: ['microban-08', 'microban-09', 'microban-10', 'microban-11', 'microban-12', 'microban-13', 'microban-14'], motif: 'sea' },
  { id: 'castle', title: 'Зеркальный замок', genre: 'Готическая сказка', description: 'За зеркалами зимнего сада ещё помнят прежний финал.', levelIds: ['microban-15', 'microban-16', 'microban-17', 'microban-18', 'microban-19', 'microban-20', 'microban-21'], motif: 'castle' },
  { id: 'pages', title: 'Незаконченные страницы', genre: 'Забытый роман', description: 'Мир из обрывков текста скрывает происхождение библиотеки.', levelIds: ['microban-22', 'microban-23', 'microban-24', 'microban-25', 'microban-26', 'microban-27', 'microban-28'], motif: 'pages' },
  { id: 'library', title: 'Запретный раздел', genre: 'Библиотека', description: 'Среди забытых книг затерялся последний след хранителя.', levelIds: ['microban-29', 'microban-30', 'microban-31', 'microban-32', 'microban-33', 'microban-34', 'microban-35'], motif: 'library' },
];

export function locationLevels(location) {
  return location.levelIds.map((id) => levels.find((level) => level.id === id)).filter(Boolean);
}

export function locationAvailable(location, completed) {
  const index = locations.indexOf(location);
  return index >= 0 && locations.slice(0, index).every((previous) =>
    previous.levelIds.every((id) => completed.has(id)));
}

export function resetLegacyProgress(storage) {
  try {
    if (storage?.getItem('library-progression-version') === '2') return;
    storage?.removeItem('lost-endings-progress');
    storage?.removeItem('library-game-session-v1');
    storage?.setItem('library-progression-version', '2');
  } catch { /* Optional storage. */ }
}

export function levelAvailable(location, index, completed) {
  const rooms = locationLevels(location);
  return locationAvailable(location, completed) && Boolean(rooms[index])
    && rooms.slice(0, index).every((room) => completed.has(room.id));
}

export function readProgress(storage) {
  try {
    const saved = JSON.parse(storage.getItem('lost-endings-progress') ?? '[]');
    // Прежние комнаты Microban сохраняют прохождение при смене карты.
    // Три самодельные схемы заменены другими задачами и не переносятся.
    const previousIds = {
      'islands-port': 'microban-01', 'islands-lighthouse': 'microban-02', 'islands-hall': 'microban-03',
      'castle-gallery': 'microban-04', 'castle-garden': 'microban-05', 'castle-tower': 'microban-06',
      'pages-passage': 'microban-08', 'pages-margin': 'microban-09', 'pages-bindery': 'microban-10',
      'library-vestibule': 'microban-11', 'library-vault': 'microban-12', 'library-ending': 'microban-13',
    };
    return new Set(Array.isArray(saved)
      ? saved.map((id) => Object.hasOwn(previousIds, id) ? previousIds[id] : id).filter((id) => levels.some((level) => level.id === id))
      : []);
  } catch { return new Set(); }
}

export function saveProgress(storage, completed) {
  try { storage.setItem('lost-endings-progress', JSON.stringify([...completed])); } catch { /* Игра доступна и без хранилища. */ }
}

const svg = (body, viewBox) => `<svg viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">${body}</svg>`;

// Клетки и перегородки берутся из исходной карты, без случайного декора 3D-сцены.
export function roomMiniature(rows) {
  const map = parseMap(rows);
  const cells = rows.flatMap((row, y) => [...row].map((symbol, x) => {
    if (map.exterior.has(`${x},${y}`)) return '';
    const rect = `<rect x="${x * 10 + 1}" y="${y * 10 + 1}" width="8" height="8" rx="1"`;
    if (symbol === '#') return `${rect} class="mini-wall"/>`;
    const floor = `${rect} class="mini-floor"/>`;
    const goal = '.*+'.includes(symbol) ? `<circle cx="${x * 10 + 5}" cy="${y * 10 + 5}" r="2.8" class="mini-goal"/>` : '';
    const box = '$*'.includes(symbol) ? `<rect x="${x * 10 + 2}" y="${y * 10 + 2}" width="6" height="6" class="mini-box"/>` : '';
    return floor + goal + box;
  })).join('');
  return svg(cells, `0 0 ${map.width * 10} ${map.height * 10}`);
}

export function mapArtwork(motif, unfolded) {
  const motifs = {
    city: '<path d="M49 155L77 117 107 140 138 91 171 115 224 61M63 59L219 146M113 45L104 170"/><path d="M152 34C125 66 179 90 157 119S190 153 180 175" class="map-river"/>' + [[61,79],[83,102],[119,111],[142,62],[186,83],[192,131],[74,147]].map(([x,y])=>`<path d="M${x} ${y}v-13l8-5 8 5v13zM${x+8} ${y-18}v18"/>`).join(''),
    sea: '<path d="M63 66q22-31 49-12l9 28-29 22-30-14zM153 117l24-23 26 12 11 29-36 16zM168 52l18-10 16 13-12 19z"/><path d="M62 134q10-7 20 0t20 0M131 72q10-7 20 0t20 0M117 161q10-7 20 0t20 0"/><path d="M104 128l57-44" stroke-dasharray="4 5"/>',
    castle: '<path d="M84 144V88h24v56m56 0V88h24v56M108 137V99h56v38M78 88l18-25 18 25m44 0 18-25 18 25M119 99l17-28 17 28M125 137v-20q11-15 22 0v20M65 156h145"/><path d="M54 53l13-17 13 17m111 7 13-17 13 17"/>',
    pages: '<path d="M66 62l68-14 14 92-68 14zM145 70l61 7-8 88-60-7zM83 78l37-7m-34 20 37-7m-34 20 29-6m38-2 36 4m-38 10 35 4m-36 10 27 3"/>',
    library: '<path d="M66 62h143v93H66zM66 93h143M66 125h143M79 90V70h12v20m9 0V68h9v22m12 0V73h14v17m14 0V68h9v22m13 0-5-20 10-3 6 21M78 122v-20h16v20m13 0v-23h10v23m18 0v-19h14v19m17 0v-20h15v20M80 152v-19h12v19m13 0v-21h16v21m12 0v-18h9v18m18 0-5-20 12-3 6 21"/>',
  };
  const compass = '<g transform="translate(231 167)"><path d="M0-16L4-4 16 0 4 4 0 16-4 4-16 0-4-4z"/><path d="M0-16V16M-16 0H16"/><text y="-21" text-anchor="middle">N</text></g>';
  const paper = '<path class="map-paper" d="M28 25Q62 17 91 24T157 24T249 23L245 184Q207 179 183 185T111 183T27 186L32 111z"/>';
  if (unfolded) return svg(`${paper}<path class="map-frame" d="M42 37H234V173H42z"/><g class="map-drawing">${motifs[motif]}${compass}<path d="M48 165h36M51 161v8m30-8v8"/></g><path class="map-fold" d="M99 26v155M179 26v156"/>`, '0 0 280 210');
  return svg(`<g class="scroll-paper"><path d="M58 60Q135 49 220 62V154Q138 146 58 157z"/><ellipse cx="58" cy="108" rx="15" ry="49"/><ellipse cx="220" cy="108" rx="15" ry="49"/><ellipse cx="58" cy="66" rx="10" ry="6"/><ellipse cx="220" cy="66" rx="10" ry="6"/></g><path class="scroll-line" d="M78 67q64-7 121 0M78 145q64-7 121 0"/><path class="scroll-ribbon" d="M129 57h20v95l-10-7-10 7z"/><circle class="scroll-seal" cx="139" cy="108" r="17"/><text class="seal-mark" x="139" y="114" text-anchor="middle">${({ sea: '≈', castle: '♜', pages: '✧', library: '▤' })[motif] ?? '✦'}</text>`, '0 0 280 210');
}
