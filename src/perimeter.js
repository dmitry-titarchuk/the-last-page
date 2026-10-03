import { cellKey, perimeterSide } from './game.js';
import { sceneConfig } from './config.js';
import { perimeterModels } from './model-registry.js';
import { createPerimeterModel } from './furniture-models.js';
export { perimeterModels, decorationModels } from './model-registry.js';
export { createPerimeterModel, createDecorationModel } from './furniture-models.js';

const wideVariants = new Set(perimeterModels.filter((model) => model.maxSpan > 1).map((model) => model.id));

// Сходные силуэты не ставим рядом, даже если модели различаются.
export function perimeterShape(variant) {
  if (['bookcase', 'ladder'].includes(variant)) return 'bookcase';
  if (variant.startsWith('bench')) return 'bench';
  if (variant.startsWith('small-chair')) return 'chair';
  if (variant.startsWith('floor-lamp')) return 'floor-lamp';
  if (['upright', 'upright-no-frame'].includes(variant)) return 'upright';
  if (['flowers', 'desk-lamp', 'statuette', 'gueridon-tripod', 'gueridon-pedestal',
    'planter', 'round-coffee-table', 'round-cafe-table', 'reading-lamp'].includes(variant)) return 'round-table';
  return variant;
}

export function roundFurnitureCount(variant, span) {
  return {
    chairs: variant.startsWith('small-chair') ? 1 : variant === 'round-cafe-table' ? 2 : 0,
    objects: perimeterShape(variant) === 'round-table' ? (variant === 'planter' ? span : 1)
      : 0,
  };
}

export function buildPerimeter(scene, map) {
  const permitted = perimeterModels.filter((model) => !sceneConfig.forbiddenPerimeterModels.includes(model.id));
  const rearVariants = permitted.filter((model) => model.rear).map((model) => model.id);
  const frontVariants = permitted.filter((model) => model.front && !model.previewOnly).map((model) => model.id);
  const walls = new Set(map.walls.map(cellKey));
  const groups = [];
  const placed = new Map();
  // Собираем прямые участки настоящего контура, разрывая их у проёмов
  // и уступов. Одна модель не пересекает поворот или пустоту.
  const sides = [];
  for (const [name, front, angle, horizontal] of [
    ['top', false, 0, true], ['left', false, Math.PI / 2, false],
    ['bottom', true, Math.PI, true], ['right', true, -Math.PI / 2, false],
  ]) {
    const lines = new Map();
    for (const point of map.walls) {
      if (perimeterSide(map, point) !== name) continue;
      const line = horizontal ? point.y : point.x;
      if (!lines.has(line)) lines.set(line, []);
      lines.get(line).push(point);
    }
    for (const points of lines.values()) {
      points.sort((a, b) => horizontal ? a.x - b.x : a.y - b.y);
      let run;
      for (const point of points) {
        const last = run?.points.at(-1);
        if (!last || (horizontal ? point.x - last.x : point.y - last.y) !== 1) {
          run = { points: [], front, angle };
          sides.push(run);
        }
        run.points.push(point);
      }
    }
  }
  const frontLength = sides.filter((side) => side.front)
    .reduce((length, side) => length + side.points.filter((point) => walls.has(cellKey(point))).length, 0);
  const roundLimit = Math.ceil(frontLength * 2 / 20);
  const roundCount = { chairs: 0, objects: 0 };
  for (const side of sides) {
    let previous;
    let bag = [];
    for (let index = 0; index < side.points.length;) {
      if (!walls.has(cellKey(side.points[index]))) { index++; previous = null; continue; }
      let remaining = 0;
      while (index + remaining < side.points.length && walls.has(cellKey(side.points[index + remaining]))) remaining++;
      if (!bag.length) {
        bag = [...(side.front ? frontVariants : rearVariants)];
        for (let i = bag.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [bag[i], bag[j]] = [bag[j], bag[i]];
        }
      }
      // Проверяем также стыки сторон в углах: там тоже не нужны одинаковые соседи.
      let singleCellFallback = false;
      const allowed = (variant) => {
        if (!singleCellFallback && remaining < (perimeterModels.find((model) => model.id === variant).minSpan ?? 1)) return false;
        const maxSpan = singleCellFallback ? 1 : Math.min(remaining, perimeterModels.find((model) => model.id === variant).maxSpan, side.front ? 2 : 3);
        const count = roundFurnitureCount(variant, maxSpan);
        if (side.front && (roundCount.chairs + count.chairs > roundLimit
          || roundCount.objects + count.objects > roundLimit)) return false;
        const shape = perimeterShape(variant);
        return shape !== perimeterShape(previous ?? '') && side.points.slice(index, index + maxSpan).every(({ x, y }) =>
          [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].every(([nx, ny]) =>
            perimeterShape(placed.get(`${nx},${ny}`) ?? '') !== shape));
      };
      let choice = bag.findLastIndex(allowed);
      if (choice < 0) {
        bag = [...(side.front ? frontVariants : rearVariants)].filter(allowed);
        // У отдельной клетки может не остаться допустимого соседа. Тогда
        // используем одноклеточную версию модели, сохраняя соседство и лимиты.
        if (!bag.length) {
          singleCellFallback = true;
          bag = [...(side.front ? frontVariants : rearVariants)].filter(allowed);
        }
        if (!bag.length) throw new Error('Не удалось подобрать модель для клетки периметра.');
        choice = Math.floor(Math.random() * bag.length);
      }
      const variant = bag.splice(choice, 1)[0];
      const span = !singleCellFallback && wideVariants.has(variant) ? Math.min(remaining, perimeterModels.find((model) => model.id === variant).maxSpan,
        side.front ? 2 : 2 + Math.floor(Math.random() * 2)) : 1;
      const cells = side.points.slice(index, index + span);
      const first = cells[0];
      const last = cells.at(-1);
      const selectedVariant = variant;
      const model = createPerimeterModel(scene, selectedVariant, span);
      if (side.front) {
        const count = roundFurnitureCount(variant, span);
        roundCount.chairs += count.chairs;
        roundCount.objects += count.objects;
      }
      // Лицевая сторона моделей — +Z: ближнюю мебель разворачиваем наружу, к зрителю.
      model.rotation.y = side.angle + (side.front ? Math.PI : 0);
      model.position.copy(scene.position({ x: (first.x + last.x) / 2, y: (first.y + last.y) / 2 }, .02));
      Object.assign(model.userData, { variant, modelVariant: selectedVariant, span, front: side.front, cells, singleCellFallback });
      scene.room.add(model);
      groups.push(model);
      cells.forEach((cell) => placed.set(cellKey(cell), variant));
      previous = variant;
      index += span;
    }
  }
  return groups;
}
