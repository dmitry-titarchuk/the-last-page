import { setRandom } from './helpers/random.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RoomScene } from '../src/scene.js';
import { buildPerimeter, createPerimeterModel, createDecorationModel, decorationModels, perimeterModels, perimeterShape, roundFurnitureCount } from '../src/perimeter.js';
import { Game, cellKey, perimeterSide } from '../src/game.js';
import { levels, playMap } from '../src/levels.js';
import { sceneConfig } from '../src/config.js';
import { ModelFactory } from '../src/model-factory.js';
import { disposeModel } from '../src/model-resources.js';

test('Одиночная клетка получает запасную модель без нарушения соседства', (t) => {
  const { map } = new Game(['########', '#@ $  .#', '#      #', '########']);
  // Сценарий с запасной моделью: геометрия тоже расходует случайные числа.
  let seed = 681;
  setRandom(t, () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  });
  const builder = new ModelFactory();
  builder.room = new THREE.Group();
  builder.position = ({ x, y }, height = 0) => new THREE.Vector3(x - (map.width - 1) / 2, height, y - (map.height - 1) / 2);
  const models = buildPerimeter(builder, map);
  try {
    assert.ok(models.some((model) => model.userData.singleCellFallback));
    const byCell = new Map(models.flatMap((model) => model.userData.cells.map((cell) => [cellKey(cell), model])));
    assert.equal(byCell.size, map.walls.length);
    for (const model of models) {
      assert.ok(model.userData.variant);
      assert.equal(new THREE.Box3().setFromObject(model).isEmpty(), false);
      if (model.userData.singleCellFallback) assert.equal(model.userData.span, 1);
      for (const { x, y } of model.userData.cells) {
        for (const key of [`${x + 1},${y}`, `${x},${y + 1}`]) {
          const neighbor = byCell.get(key);
          if (neighbor && neighbor !== model) {
            assert.notEqual(perimeterShape(model.userData.variant), perimeterShape(neighbor.userData.variant));
          }
        }
      }
    }
  } finally {
    disposeModel(builder.room);
  }
});

function setup(map) {
  const scene = Object.create(RoomScene.prototype);
  scene.scene = new THREE.Scene();
  scene.room = new THREE.Group();
  scene.scene.add(scene.room);
  scene.map = map;
  return scene;
}

function furnitureBounds(model) {
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3();
  for (const part of model.children.filter((child) => !child.userData.decoration && !child.userData.attachment)) {
    bounds.union(new THREE.Box3().setFromObject(part));
  }
  return bounds;
}

test('Старинный декор помещается на клетке и стоит на тумбах и длинных картотеках без повторений', (t) => {
  let random = 0;
  setRandom(t, () => random);
  const scene = setup();
  const ids = ['globe', 'hourglass', 'compass', 'pocket-watch', 'candlestick', 'inkwell',
    'wax-seal', 'antique-phone', 'wooden-box', 'camera', 'gramophone'];
  const common = decorationModels;
  for (const id of ids) {
    for (const value of [0, .5, .999999]) {
      random = value;
      const model = createDecorationModel(scene, id);
      scene.room.add(model);
      const bounds = new THREE.Box3().setFromObject(model);
      const size = bounds.getSize(new THREE.Vector3());
      assert.ok(Math.abs(bounds.min.y) < .003, `${id}: опирается на поверхность`);
      assert.ok(size.x < .75 && size.z < .75 && size.y < .75, `${id}: компактный декор`);
    }
    random = (common.findIndex((model) => model.id === id) + .1) / common.length;
    for (const variant of ['sideboard', 'files']) {
      const model = createPerimeterModel(scene, variant, 3);
      scene.room.add(model);
      const top = furnitureBounds(model).max.y;
      const items = model.children.filter((child) => child.userData.decoration);
      assert.equal(items.length, 3);
      assert.equal(items[0].userData.decoration, id, `${id}: входит в общий набор`);
      assert.equal(new Set(items.map((item) => item.userData.decoration)).size, 3);
      for (const item of items) {
        const bounds = new THREE.Box3().setFromObject(item);
        assert.ok(Math.abs(bounds.min.y - top) < .003, `${variant}/${id}: стоит на мебели`);
        const scale = item.getWorldScale(new THREE.Vector3());
        assert.ok(Math.abs(scale.x - sceneConfig.decorationScale) < 1e-6);
        assert.ok(Math.abs(scale.x - scale.y) < 1e-6 && Math.abs(scale.y - scale.z) < 1e-6);
      }
    }
  }
  for (const span of [1, 2]) {
    const model = createPerimeterModel(scene, 'files', span);
    scene.room.add(model);
    assert.equal(model.children.some((child) => child.userData.decoration), false);
  }
  scene.clearRoom();
});

test('Новый декор опирается на поверхность, совы отличаются высотой и цветом', () => {
  const scene = setup();
  const heights = [];
  const colors = [];
  for (const id of ['owl-small', 'statuette', 'owl-tall', 'umbrella', 'newspaper', 'open-letter', 'coffee-cup', 'white-cat']) {
    const model = createDecorationModel(scene, id);
    scene.room.add(model);
    const bounds = new THREE.Box3().setFromObject(model);
    assert.ok(bounds.min.y >= -1e-6 && bounds.min.y < .025, `${id}: опирается на поверхность`);
    assert.ok(bounds.getSize(new THREE.Vector3()).x < .94, `${id}: помещается на столике`);
    if (id.includes('owl') || id === 'statuette') {
      heights.push(bounds.max.y);
      colors.push(model.children[0].children[0].children[1].material.color.getHex());
    }
  }
  assert.ok(heights[0] < heights[1] && heights[1] < heights[2]);
  assert.equal(new Set(colors).size, 3);
  scene.clearRoom();
});

test('Подставки декора заменены круглыми геридонами', () => {
  const scene = setup();
  for (const variant of ['flowers', 'desk-lamp', 'statuette', 'planter']) {
    const model = createPerimeterModel(scene, variant);
    scene.room.add(model);
    const furniture = model.children.filter((child) => !child.userData.decoration);
    assert.ok(furniture.some((part) => part.geometry?.type === 'CylinderGeometry'
      && part.geometry.parameters.radiusTop === .3), `${variant}: круглая столешница`);
    assert.ok(!furniture.some((part) => part.geometry?.type === 'BoxGeometry'), `${variant}: нет прямоугольной подставки`);
    for (const item of model.children.filter((child) => child.userData.decoration)) {
      assert.ok(item.position.y >= .3, `${variant}: предмет поднят на геридон`);
    }
  }
  scene.clearRoom();
});

test('Любой декор доступен на каждой поверхности без повторений и сохраняет опору', (t) => {
  let random = 0;
  setRandom(t, () => random);
  const scene = setup();
  const surfaces = [
    ['gueridon-tripod', 1, .36], ['gueridon-pedestal', 1, .36],
    ['bench', 2, .32], ['bench-back', 2, .32], ['bench-arms', 2, .32], ['bench-spindles', 2, .32],
    ['ottoman', 1, .418], ['planter', 1, .3], ['round-coffee-table', 1, .33],
    ['round-cafe-table', 2, .48], ['small-chair', 1, .342], ['small-chair-round', 1, .342],
    ['flowers', 1, .36], ['desk-lamp', 1, .36], ['statuette', 1, .36],
    ['sideboard', 3, .74], ['files', 3],
    ['storage-chest', 1, .45], ['storage-chest', 2, .45],
    ['low-shelf', 1, .4275], ['low-shelf', 2, .4275],
  ];
  const originalChance = sceneConfig.chairDecorationChance;
  sceneConfig.chairDecorationChance = 1;
  try {
    for (const [index, { id }] of decorationModels.entries()) {
      random = (index + .1) / decorationModels.length;
      for (const [variant, span, base] of surfaces) {
        const model = createPerimeterModel(scene, variant, span);
        scene.room.add(model);
        model.updateMatrixWorld(true);
        const items = model.children.filter((child) => child.userData.decoration);
        assert.equal(items.length, ['round-cafe-table', 'storage-chest', 'low-shelf'].includes(variant) ? 1 : span, `${variant}: количество предметов`);
        if (['storage-chest', 'low-shelf'].includes(variant)) {
          assert.equal(items[0].position.x, 0, `${variant}: предмет по центру поверхности`);
          assert.equal(items[0].position.z, 0, `${variant}: предмет по центру поверхности`);
        }
        assert.equal(items[0].userData.decoration, id, `${variant}: доступен ${id}`);
        assert.equal(new Set(items.map((item) => item.userData.decoration)).size, items.length);
        if (variant.startsWith('gueridon-')) {
          const size = furnitureBounds(model).getSize(new THREE.Vector3());
          assert.ok(size.x < .5 && size.z < .5, 'Геридон сохраняет размеры');
        }
        const top = base ?? furnitureBounds(model).max.y;
        for (const item of items) {
          const bounds = new THREE.Box3().setFromObject(item);
          assert.ok(Math.abs(bounds.min.y - top) < .025, `${variant}/${id}: опирается на поверхность`);
        }
        scene.clearRoom();
      }
    }
  } finally {
    sceneConfig.chairDecorationChance = originalChance;
    scene.clearRoom();
  }
});

test('Нижняя планка скамьи соединяется с ножками через боковые поперечины', () => {
  const scene = setup();
  for (const span of [1, 2]) {
    const model = createPerimeterModel(scene, 'bench-back', span);
    scene.room.add(model);
    model.updateMatrixWorld(true);
    const lower = model.children.filter((part) => Math.abs(part.position.y - .15) < 1e-6);
    const rail = new THREE.Box3().setFromObject(lower.at(-1));
    assert.equal(lower.length, 3);
    for (const crossbar of lower.slice(0, 2)) {
      const bounds = new THREE.Box3().setFromObject(crossbar);
      assert.ok(bounds.intersectsBox(rail), 'Поперечина соединена с продольной планкой');
      const legs = model.children.filter((part) => Math.abs(part.position.y - .145) < 1e-6
        && Math.abs(part.position.x - crossbar.position.x) < 1e-6);
      assert.equal(legs.length, 2);
      for (const leg of legs) assert.ok(bounds.intersectsBox(new THREE.Box3().setFromObject(leg)),
        'Поперечина соединена с ножкой');
    }
  }
  scene.clearRoom();
});

test('Мебель заполняет плитки, а декор и лестница выступают незначительно', (t) => {
  let random = 0;
  setRandom(t, () => random);
  const scene = setup();
  const benches = ['bench', 'bench-back', 'bench-arms', 'bench-spindles'];
  const front = ['coffee-table', 'round-coffee-table', 'round-cafe-table', 'gueridon-tripod', 'gueridon-pedestal', 'small-chair', 'small-chair-round', 'low-shelf', ...benches, 'ottoman', 'planter', 'reading-lamp', 'reading-table', 'periodicals-rack', 'floor-planter', 'storage-chest', 'flowers', 'desk-lamp', 'statuette'];
  const wide = ['coffee-table', 'round-cafe-table', 'bookcase', 'files', 'ladder', 'low-shelf', ...benches, 'reading-table', 'periodicals-rack', 'floor-planter', 'storage-chest', 'sideboard'];
  for (const value of [0, .5, .999999]) {
    random = value;
    for (const variant of [...front, 'bookcase', 'files', 'ladder', 'floor-lamp', 'floor-lamp-classic', 'armchair', 'plant', 'sideboard']) {
      const maxSpan = perimeterModels.find((model) => model.id === variant).maxSpan;
      for (const span of wide.includes(variant) ? Array.from({ length: maxSpan }, (_, index) => index + 1) : [1]) {
        const model = createPerimeterModel(scene, variant, span);
        scene.room.add(model);
        const bounds = new THREE.Box3().setFromObject(model);
        const furniture = furnitureBounds(model);
        assert.ok(bounds.min.x >= -span / 2 - .2 && bounds.max.x <= span / 2 + .2, `${variant}: длина`);
        assert.ok(bounds.min.z >= -.7 && bounds.max.z <= .7, `${variant}: глубина`);
        assert.ok(bounds.min.y >= -.000001, `${variant}: стоит на полу`);
        assert.ok(furniture.max.y <= (front.includes(variant) ? 1 : 2.6), `${variant}: высота мебели`);
        if (variant === 'round-cafe-table') {
          assert.ok(model.scale.y <= 1);
          assert.equal(model.scale.x, model.scale.y, 'Комплект сохраняет пропорции');
          assert.equal(model.scale.z, model.scale.y);
        } else assert.equal(model.scale.y, 1, 'Высота мебели сохраняется');
        if (benches.includes(variant)) assert.ok(furniture.max.y + .02 <= .58,
          `${variant}: спинка и подлокотники не закрывают поле`);
        if (['reading-lamp', 'floor-lamp', 'floor-lamp-classic'].includes(variant)) {
          assert.ok(furniture.getSize(new THREE.Vector3()).x <= .61, `${variant}: компактное основание`);
          assert.equal(model.scale.x, 1);
          assert.equal(model.scale.z, 1);
          continue;
        }
        if (['small-chair', 'small-chair-round', 'round-coffee-table', 'round-cafe-table'].includes(variant)) {
          if (variant !== 'round-cafe-table') assert.deepEqual(model.scale.toArray(), [1, 1, 1]);
          assert.ok(Math.max(Math.abs(furniture.min.x), Math.abs(furniture.max.x)) <= (span - .06) / 2 + 1e-6);
          assert.ok(Math.max(Math.abs(furniture.min.z), Math.abs(furniture.max.z)) <= .47 + 1e-6);
          continue;
        }
        assert.ok(Math.abs(Math.max(Math.abs(furniture.min.x), Math.abs(furniture.max.x)) - (variant.startsWith('gueridon-') ? sceneConfig.gueridonRadius : variant.startsWith('small-chair') ? .3 : (span - .06) / 2)) < 1e-6,
          `${variant}: занимает почти всю длину выделенных клеток`);
        assert.ok(Math.abs(Math.max(Math.abs(furniture.min.z), Math.abs(furniture.max.z)) - (variant.startsWith('gueridon-') ? sceneConfig.gueridonRadius : variant.startsWith('small-chair') ? .3 : .47)) < 1e-6,
          `${variant}: занимает выделенную глубину клетки`);
        if (variant === 'bookcase' || variant === 'ladder') assert.ok(bounds.max.y > 1.9);
      }
    }
  }
  scene.clearRoom();
});

test('Периметр покрывает только стены, ровно один раз, и учитывает проёмы и низкий передний край', (t) => {
  let random = 0;
  setRandom(t, () => random);
  const maps = [...levels.map((level) => level.map), [
    '##  ####', '#@ $  .#', '       #', '#      #', '###  ###',
  ]];
  let foundWide = false;
  for (const value of [0, .25, .5, .75, .999999]) {
    random = value;
    for (const rows of maps) {
      const { map } = new Game(rows);
      const scene = setup(map);
      const models = buildPerimeter(scene, map);
      const covered = models.flatMap((model) => model.userData.cells.map(cellKey));
      const expected = map.walls.filter((point) => perimeterSide(map, point)).map(cellKey);
      assert.deepEqual(covered.toSorted(), expected.toSorted());
      assert.equal(new Set(covered).size, covered.length, 'Углы и стыки не перекрываются');
      for (const model of models) {
        const { span, cells, front } = model.userData;
        assert.ok(!sceneConfig.forbiddenPerimeterModels.includes(model.userData.modelVariant), 'Запрещённые модели не используются');
        if (!front) assert.ok(!['flowers', 'desk-lamp', 'statuette'].includes(model.userData.variant),
          'На задних стенах нет предметов на подставках');
        assert.ok(span >= 1 && span <= 3);
        if (model.userData.variant === 'planter') assert.equal(span, 1, 'Геридон с растением занимает одну клетку');
        if (front) assert.ok(span <= 2, 'На переднем краю нет моделей длиннее двух клеток');
        const entry = perimeterModels.find(({ id }) => id === model.userData.variant);
        assert.ok(span >= (model.userData.singleCellFallback ? 1 : entry.minSpan ?? 1) && span <= entry.maxSpan, `${entry.id}: допустимая длина`);
        const facing = new THREE.Vector3(0, 0, 1).applyQuaternion(model.quaternion);
        const side = perimeterSide(map, cells[0]);
        assert.ok(cells.every((point) => perimeterSide(map, point) === side));
        assert.ok(cells.every((point, i) => i === 0 || Math.abs(point.x - cells[i - 1].x) + Math.abs(point.y - cells[i - 1].y) === 1));
        if (side === 'right') {
          assert.ok(facing.x > .99, 'Передний правый край обращён лицом к зрителю');
        } else if (side === 'bottom') {
          assert.ok(facing.z > .99, 'Передний нижний край обращён лицом к зрителю');
        } else if (side === 'top') {
          assert.ok(facing.z > .99, 'Задняя мебель обращена внутрь комнаты');
        } else {
          assert.ok(facing.x > .99, 'Левая мебель обращена внутрь комнаты');
        }
        foundWide ||= span > 1;
        const bounds = new THREE.Box3().setFromObject(model);
        const points = cells.map((cell) => scene.position(cell));
        assert.ok(bounds.min.x >= Math.min(...points.map((p) => p.x)) - .7 - 1e-6);
        assert.ok(bounds.max.x <= Math.max(...points.map((p) => p.x)) + .7 + 1e-6);
        assert.ok(bounds.min.z >= Math.min(...points.map((p) => p.z)) - .7 - 1e-6);
        assert.ok(bounds.max.z <= Math.max(...points.map((p) => p.z)) + .7 + 1e-6);
        if (side === 'right' || side === 'bottom') {
          assert.equal(front, true);
          assert.ok(furnitureBounds(model).max.y <= .58, 'Ближние края имеют естественно низкую мебель');
        }
      }
      const frontModels = models.filter((model) => model.userData.front);
      const frontLength = frontModels.reduce((sum, model) => sum + model.userData.span, 0);
      const counts = frontModels.map((model) => roundFurnitureCount(model.userData.variant, model.userData.span));
      for (const category of ['chairs', 'objects']) {
        assert.ok(counts.reduce((sum, count) => sum + count[category], 0) <= Math.ceil(frontLength * 2 / 20));
      }
      const modelByCell = new Map(models.flatMap((model) => model.userData.cells.map((cell) => [cellKey(cell), model])));
      for (const model of models) for (const { x, y } of model.userData.cells) {
        for (const key of [`${x + 1},${y}`, `${x},${y + 1}`]) {
          const neighbor = modelByCell.get(key);
          if (neighbor && neighbor !== model) assert.notEqual(perimeterShape(neighbor.userData.variant), perimeterShape(model.userData.variant),
            'Одинаковые модели не стоят рядом, в том числе в углах');
        }
      }
      scene.clearRoom();
    }
  }
  assert.ok(foundWide, 'В периметре используются модели на несколько плиток');
});

test('На длинных поверхностях разные композиции, даже при постоянном случайном значении', (t) => {
  let random = 0;
  setRandom(t, () => random);
  const scene = setup();
  for (const value of [0, .5, .999999]) {
    random = value;
    for (const variant of ['sideboard', 'files']) {
      const model = createPerimeterModel(scene, variant, 3);
      scene.room.add(model);
      const items = model.children.filter((child) => child.userData.decoration);
      assert.equal(items.length, 3, `${variant}: три композиции на трёх плитках`);
      assert.equal(new Set(items.map((item) => item.userData.decoration)).size, 3, `${variant}: нет одинаковых вещей`);
      for (let i = 0; i < items.length; i++) {
        const bounds = new THREE.Box3().setFromObject(items[i]);
        assert.ok(bounds.min.y >= items[i].position.y - 1e-6, 'Предмет стоит на поверхности');
        if (i > 0) assert.ok(bounds.min.x > new THREE.Box3().setFromObject(items[i - 1]).max.x,
          'Соседние композиции не пересекаются');
      }
    }
  }
  scene.clearRoom();
});

test('Предметы на увеличенной мебели увеличены равномерно и сохраняют пропорции при повороте', (t) => {
  let random = 0;
  setRandom(t, () => random);
  const scene = setup();
  for (const value of [0, .5, .999999]) {
    random = value;
    for (const variant of ['sideboard', 'files', 'planter', 'flowers', 'desk-lamp', 'statuette', 'reading-lamp', 'ottoman']) {
      const span = ['sideboard', 'files'].includes(variant) ? 3 : 1;
      const model = createPerimeterModel(scene, variant, span);
      model.rotation.y = Math.PI / 2;
      model.updateMatrixWorld(true);
      const items = model.children.filter((child) => child.userData.decoration);
      assert.ok(items.length > 0, `${variant}: есть предметы на поверхности`);
      for (const item of items) {
        const content = item.children[0].isGroup ? item.children[0] : item;
        if (variant === 'ottoman') {
          const bounds = new THREE.Box3().setFromObject(item);
          assert.ok(bounds.min.y >= item.position.y - 1e-6, 'Декор лежит поверх обивки');
        }
        const origin = content.localToWorld(new THREE.Vector3());
        const axes = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)]
          .map((axis) => content.localToWorld(axis).sub(origin));
        axes.forEach((axis) => assert.ok(Math.abs(axis.length() - sceneConfig.decorationScale) < 1e-6,
          'Декор увеличен равномерно по всем осям'));
        assert.ok(Math.abs(axes[0].dot(axes[2])) < 1e-6, 'Поворот не вызывает перекос');
      }
    }
  }
});

test('Книги низкого модуля утоплены от края, лестница прислонена снаружи стеллажа', (t) => {
  let random = 0;
  setRandom(t, () => random);
  const scene = setup();
  for (const value of [0, .5, .999999]) {
    random = value;
    const shelf = createPerimeterModel(scene, 'low-shelf', 2);
    shelf.updateMatrixWorld(true);
    const books = shelf.children.filter((child) => child.geometry?.parameters.depth === .26);
    assert.ok(books.length > 0);
    for (const book of books) {
      const bounds = new THREE.Box3().setFromObject(book);
      const thickness = book.geometry.parameters.width;
      assert.ok(Math.abs(book.position.z - (.205 - thickness * sceneConfig.lowShelfBookInset * shelf.scale.x / shelf.scale.z)) < 1e-6,
        'Книга сдвинута внутрь на 20% толщины корешка');
      assert.ok(bounds.max.z > .39 && bounds.max.z < .45, 'Книги остаются возле лицевого края');
    }
    const model = createPerimeterModel(scene, 'ladder', 2);
    model.updateMatrixWorld(true);
    const anchor = model.children.find((child) => child.userData.attachment === 'ladder');
    const ladder = anchor.children[0];
    const height = ladder.children[0].geometry.parameters.height;
    const bottom = ladder.localToWorld(new THREE.Vector3());
    const top = ladder.localToWorld(new THREE.Vector3(0, height, 0));
    assert.ok(bottom.z > .6 && bottom.z < .7, 'Низ лестницы вынесен за край клетки');
    assert.ok(top.z > .47 && top.z < .53, 'Верх опирается на наружный край стеллажа');
    assert.ok(top.y > bottom.y + 1.7, 'Лестница стоит с небольшим наклоном');
  }
});

test('Камера учитывает высокую мебель, а ход и перезапуск сохраняют случайный периметр', () => {
  const game = new Game(levels[0].map);
  const scene = setup(game.map);
  scene.renderer = { render() {} };
  scene.resize = () => {};
  scene.reduceMotion = true;
  scene.load(game.map, game.state);
  const models = scene.perimeter.slice();
  const bounds = new THREE.Box3().setFromObject(scene.room);
  assert.ok(scene.roomHeight >= bounds.max.y + .149);
  game.move('down');
  scene.sync(game.state, true);
  game.restart();
  scene.sync(game.state, true);
  assert.deepEqual(scene.perimeter, models);
  scene.clearRoom();
});


test('Кофейный столик всегда сопровождают два пустых стула, один или оба повёрнуты на 45°', (t) => {
  let random = 0;
  setRandom(t, () => random);
  const scene = setup();
  const counts = new Set();
  for (const value of [0, .5, .999999]) {
    random = value;
    for (const span of [1, 2]) {
      const table = createPerimeterModel(scene, 'round-cafe-table', span);
      const chairs = table.children.filter((child) => child.userData.chair);
      assert.equal(chairs.length, 2);
      const turned = chairs.filter((chair) => chair.userData.tableAngle > 0);
      counts.add(turned.length);
      assert.ok(turned.length === 1 || turned.length === 2);
      for (const chair of chairs) {
        const facing = new THREE.Vector3(0, 0, 1).applyQuaternion(chair.quaternion);
        const alignment = facing.dot(chair.position.clone().negate().normalize());
        assert.ok(Math.abs(alignment - Math.cos(chair.userData.tableAngle)) < 1e-6);
        assert.ok(chair.userData.tableAngle === 0 || chair.userData.tableAngle === Math.PI / 4);
        chair.traverse((part) => assert.ok(!part.userData.decoration, 'Сиденье свободно'));
      }
      assert.equal(table.children.filter((child) => child.userData.decoration).length, 1,
        'Декор размещён только на столе');
    }
  }
  assert.deepEqual([...counts].sort(), [1, 2]);
});

test('Отдельные стулья разворачиваются в обе стороны и могут нести декор на сиденье', (t) => {
  let random = 0;
  setRandom(t, () => random);
  const scene = setup();
  for (const variant of ['small-chair', 'small-chair-round']) {
    for (const value of [0, .999999]) {
      random = value;
      const model = createPerimeterModel(scene, variant);
      model.updateMatrixWorld(true);
      const chair = model.children.find((child) => child.userData.chair);
      assert.equal(chair.rotation.y, value === 0 ? 0 : Math.PI);
      const items = model.children.filter((child) => child.userData.decoration);
      assert.equal(items.length, value === 0 ? 1 : 0);
      for (const item of items) {
        assert.ok(decorationModels.some(({ id }) => id === item.userData.decoration));
        const bounds = new THREE.Box3().setFromObject(item);
        assert.ok(Math.abs(bounds.min.y - .342) < 1e-6, 'Предмет опирается на сиденье');
      }
    }
  }
});


test('Купол лампы имеет внутреннюю поверхность, светильники мягко светятся', () => {
  const scene = setup();
  const reading = createPerimeterModel(scene, 'reading-lamp');
  const floor = createPerimeterModel(scene, 'floor-lamp');
  let lining;
  reading.traverse((part) => { if (part.userData.lampPart === 'lining') lining = part; });
  assert.ok(lining);
  assert.equal(lining.material.side, THREE.BackSide);
  assert.ok(lining.material.emissiveIntensity > 0);
  const globe = floor.children.find((part) => part.userData.lampPart === 'globe');
  assert.ok(globe.material.emissiveIntensity > 0);
  floor.updateMatrixWorld(true);
  const scale = globe.getWorldScale(new THREE.Vector3());
  assert.ok(Math.abs(scale.x - scale.y) < 1e-6 && Math.abs(scale.z - scale.y) < 1e-6,
    'Опаловый шар не сплющен подгонкой мебели к клетке');
  assert.ok(new THREE.Box3().setFromObject(reading).max.y < 1);
});


test('Двухклеточные книги доступны на переднем краю и сохраняют низкий силуэт', (t) => {
  let random = 0;
  setRandom(t, () => random);
  const scene = setup();
  for (const value of [0, .5, .999999]) {
    random = value;
    for (const variant of ['stack', 'upright', 'upright-no-frame']) {
      const model = createPerimeterModel(scene, variant, 2);
      const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
      assert.ok(size.x > 1.85 && size.x <= 1.94 + 1e-6, `${variant}: занимает две клетки`);
      assert.ok(size.y <= .58, `${variant}: не заслоняет поле`);
      assert.ok(size.z <= .94 + 1e-6);
      if (variant === 'upright-no-frame') {
        assert.ok(model.children.every((child) => child.isGroup), 'Остались только книги без деревянных деталей');
      }
    }
  }
  const game = new Game(['##############################', '#@ $                       . #', '#                            #', '##############################']);
  scene.map = game.map;
  const placed = new Set();
  for (const value of [0, .25, .5, .75, .999999]) {
    random = value;
    for (const model of buildPerimeter(scene, game.map)) {
      if (!['stack', 'upright', 'upright-no-frame'].includes(model.userData.variant)) continue;
      assert.equal(model.userData.front, true);
      assert.equal(model.userData.span, 2);
      placed.add(model.userData.variant);
    }
  }
  assert.equal(placed.size, 3, 'Все три варианта входят в игровой набор');
});

test('Лампы сохраняют размеры на обеих передних и задних сторонах поля', () => {
  const scene = setup();
  const reading = createPerimeterModel(scene, 'reading-lamp');
  const top = reading.children.find((part) => part.geometry?.type === 'CylinderGeometry');
  assert.equal(top.geometry.parameters.height, .025);
  assert.equal(top.geometry.parameters.radiusTop, sceneConfig.readingLampTableRadius);
  const floor = createPerimeterModel(scene, 'floor-lamp');
  assert.equal(floor.children[0].geometry.parameters.radiusTop, sceneConfig.floorLampBaseRadius);
  const globe = floor.children.find((part) => part.userData.lampPart === 'globe');
  for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    floor.rotation.y = angle;
    floor.updateMatrixWorld(true);
    const size = new THREE.Box3().setFromObject(globe).getSize(new THREE.Vector3());
    assert.ok(Math.abs(size.x - size.y) < .002 && Math.abs(size.z - size.y) < .002,
      'Шар сохраняет одинаковый диаметр при развороте модели на поле');
  }
  const classic = createPerimeterModel(scene, 'floor-lamp-classic');
  assert.ok(classic.children.some((part) => part.geometry?.parameters.openEnded), 'Старый конический абажур восстановлен');
});


test('Общий лимит обеих передних сторон масштабируется с длиной стен', (t) => {
  let seed = 12345;
  setRandom(t, () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  });
  const roundTables = new Set(['flowers', 'desk-lamp', 'statuette', 'gueridon-tripod',
    'gueridon-pedestal', 'planter', 'reading-lamp', 'round-coffee-table', 'round-cafe-table']);
  const benches = new Set();
  for (const width of [6, 17, 18, 37]) for (let run = 0; run < 4; run++) {
    const rows = ['#'.repeat(width), '#' + ' '.repeat(width - 2) + '#',
      '#@$. ' + ' '.repeat(width - 6) + '#', '#'.repeat(width)];
    const { map } = new Game(rows);
    const scene = setup(map);
    const models = buildPerimeter(scene, map).filter((model) => model.userData.front);
    let chairs = 0;
    let objects = 0;
    for (const model of models) {
      const { variant, span } = model.userData;
      if (variant.startsWith('small-chair')) chairs++;
      if (variant === 'round-cafe-table') chairs += 2;
      if (roundTables.has(variant)) objects += variant === 'planter' ? span : 1;
      if (variant.startsWith('bench')) benches.add(variant);
    }
    const limit = Math.ceil((width + 3) / 10);
    assert.ok(chairs <= limit);
    assert.ok(objects <= limit);
    scene.clearRoom();
  }
  assert.deepEqual([...benches].sort(), ['bench-arms', 'bench-back', 'bench-spindles']);
});


test('Стеллаж для периодики и сундук низкие и только спереди, стол для чтения и клумба отключены', (t) => {
  let seed = 42;
  setRandom(t, () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  });
  const ids = ['periodicals-rack', 'storage-chest'];
  const seen = new Set();
  const { map } = new Game([
    '####################', '#@ $ .             #', '#                  #',
    '#                  #', '####################',
  ]);
  const scene = setup(map);
  for (let iteration = 0; iteration < 12; iteration++) {
    const models = buildPerimeter(scene, map);
    for (const model of models) {
      const { variant, span, front } = model.userData;
      assert.ok(!['ottoman', 'bench', 'reading-table', 'floor-planter'].includes(variant), `${variant}: отключён в игре`);
      if (!ids.includes(variant)) continue;
      assert.equal(front, true, `${variant}: только передний край`);
      assert.equal(span, 2);
      const bounds = furnitureBounds(model);
      assert.ok(bounds.max.y <= .58, `${variant}: низкий силуэт вместе со встроенным содержимым`);
      seen.add(`${variant}/${front}`);
    }
    scene.clearRoom();
  }
  for (const id of ids) {
    assert.ok(seen.has(`${id}/true`), `${id}: встречается на переднем краю`);
  }
});


test('уступ левой стены первой игровой карты остаётся низким', (t) => {
  let seed = 2026;
  setRandom(t, () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; });
  const { map } = new Game(playMap(levels[0]));
  for (let iteration = 0; iteration < 8; iteration++) {
    const scene = setup(map);
    const models = buildPerimeter(scene, map);
    for (const y of [5, 6]) {
      const model = models.find((model) => model.userData.cells.some((cell) => cell.x === 2 && cell.y === y));
      assert.ok(model);
      assert.equal(model.userData.front, true);
      assert.ok(furnitureBounds(model).max.y <= .58, 'Низкая мебель на коротком уступе не закрывает поле');
    }
    scene.clearRoom();
  }
});
