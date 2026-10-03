import { setRandom } from './helpers/random.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RoomScene, pairInteriorWalls } from '../src/scene.js';
import { Game, cellKey, perimeterSide } from '../src/game.js';
import { sceneConfig } from '../src/config.js';
import { levels, playMap } from '../src/levels.js';

function setup() {
  // Проверяем настоящую сцену и позы без зависимости от WebGL и браузера.
  const scene = Object.create(RoomScene.prototype);
  scene.scene = new THREE.Scene();
  scene.renderer = { render() {} };
  scene.resize = () => {};
  scene.reduceMotion = false;
  const game = new Game(['########', '#@ $  .#', '#      #', '########']);
  scene.load(game.map, game.state);
  return { scene, game };
}

function advance(scene, start, end) {
  for (let time = start; time < end; time += 1000 / 60) scene.frame(time);
  scene.frame(end);
}

test('На первом уровне стрелка лежит на полу, а призрак показывает ключевую позицию', () => {
  const { scene } = setup();
  const game = new Game(playMap(levels[0]));
  scene.load(game.map, game.state, { tutorial: true });
  assert.ok(scene.hintArrow.visible);
  for (const mesh of [scene.hintShaft, scene.hintHead]) {
    assert.equal(mesh.material.depthTest, true, 'Стрелка не рисуется поверх объектов');
    assert.equal(mesh.material.depthWrite, true, 'Верх стрелки закрывает дальнюю боковую грань');
    assert.equal(mesh.renderOrder, 0);
  }
  assert.ok(scene.hintGhost.visible);
  assert.ok(scene.hintGhost.position.equals(scene.position(scene.hint.to, .02)));
  assert.ok(scene.hintGhost.children.every((node) => node.isMesh && !node.material.wireframe));
  assert.equal(scene.hintGhost.getObjectByName('chest-floor'), undefined, 'Внутренняя обшивка не попадает в призрак');
  const ghostBounds = new THREE.Box3().setFromObject(scene.hintGhost).getSize(new THREE.Vector3());
  const chestBounds = new THREE.Box3().setFromObject(scene.boxes[0]).getSize(new THREE.Vector3());
  assert.ok(ghostBounds.distanceTo(chestBounds) < .000001);
  assert.equal(scene.hintShaft.material.transparent, false);
  assert.equal(scene.hintShaft.material.opacity, 1);
  assert.ok(scene.hintShaft.material.color.equals(new THREE.Color(0xe8bb4b)));
  assert.ok(scene.position(scene.hint.to).z > scene.position(scene.hint.from).z,
    'Первый толчок направлен к зрителю');
  for (const ink of scene.hintGhostMaterials) {
    assert.equal(ink.depthTest, true);
    assert.equal(ink.depthWrite, false);
    assert.ok(ink.transparent);
    assert.ok(ink.opacity < .3, 'Призрак остаётся полупрозрачным');
  }
  assert.ok(scene.hintGhostMaterials.every((ink) => ink.color.getHex() === 0xffffff),
    'Призрак белый без бордовых и жёлтых деталей');
  const shader = { uniforms: {}, vertexShader: '#include <begin_vertex>', fragmentShader: '#include <color_fragment>' };
  scene.hintGhostMaterials[0].onBeforeCompile(shader);
  assert.equal(shader.uniforms.ghostTime, scene.hintGhostTime);
  assert.ok(shader.fragmentShader.includes('vGhostPosition.y'), 'Перелив зависит от положения на поверхности');
  assert.ok(shader.fragmentShader.includes('diffuseColor.a *= 1.0 -'), 'Бегущая полоса делает призрак прозрачнее');
  assert.ok(!shader.fragmentShader.includes('diffuseColor.rgb ='), 'Полоса не меняет цвет призрака');
  scene.updateHintGhost(0);
  const phase = scene.hintGhostTime.value;
  scene.updateHintGhost(1000);
  assert.notEqual(scene.hintGhostTime.value, phase);
  scene.reduceMotion = true;
  scene.updateHintGhost(0);
  const stillPhase = scene.hintGhostTime.value;
  scene.updateHintGhost(1000);
  assert.equal(scene.hintGhostTime.value, stillPhase);
  for (const mesh of [scene.hintShaftEdge, scene.hintHeadEdge]) {
    assert.ok(mesh.material.color.equals(new THREE.Color(0x8c6226)));
    mesh.geometry.computeBoundingBox();
    assert.ok(Math.abs(mesh.geometry.boundingBox.getSize(new THREE.Vector3())[mesh === scene.hintShaftEdge ? 'y' : 'z'] - .0175) < .000001,
      'Тёмная грань даёт стрелке небольшую толщину');
  }
  scene.boxes[scene.hint.boxIndex].position.copy(scene.hintGhost.position);
  scene.updateHintGhost(1000);
  assert.equal(scene.hintGhost.visible, false, 'Прибывший сундук заменяет призрак');
  assert.ok(game.move('up'));
  scene.sync(game.state, true);
  assert.ok(scene.hintGhost.visible);
  game.undo();
  scene.sync(game.state, true);
  assert.ok(scene.hintGhost.position.equals(scene.position(scene.hint.to, .02)));
  scene.load(game.map, game.state);
  assert.equal(scene.hintArrow.visible, false);
  assert.equal(scene.hintGhost.visible, false);
});

test('Янтарный блик движется по постоянно видимой стрелке и отключается при уменьшении движения', () => {
  const { scene, game } = setup();
  scene.load(game.map, game.state, { tutorial: true });
  const meshes = [scene.hintShaft, scene.hintHead, scene.hintShaftEdge, scene.hintHeadEdge];
  scene.updateHintArrow(900);
  assert.ok(meshes.every((mesh) => mesh.visible));
  const phase = scene.hintFlowTime.value;
  scene.updateHintArrow(1200);
  assert.ok(scene.hintFlowTime.value > phase);
  assert.ok(meshes.every((mesh) => mesh.visible));
  const shader = { uniforms: {}, vertexShader: '#include <begin_vertex>', fragmentShader: '#include <color_fragment>' };
  scene.hintShaft.material.onBeforeCompile(shader);
  assert.equal(shader.uniforms.hintFlowTime, scene.hintFlowTime);
  assert.equal(shader.uniforms.hintFlowStrength, scene.hintFlowStrength);
  assert.equal(shader.uniforms.hintRouteLength, scene.hintRouteLength);
  assert.ok(shader.fragmentShader.includes('softDuration = (hintRouteLength + .7) / .9'),
    'Мягкий блик проходит всю длину маршрута');
  assert.ok(shader.fragmentShader.includes('flashAge = max(0.0, cycleAge - softDuration)'),
    'После мягкого прохода возраст единственной вспышки растёт без повторов');
  assert.notEqual(scene.hintHead.material, scene.hintShaft.material, 'Наконечник имеет отдельный однотонный материал');
  assert.ok(scene.hintHead.material.color.equals(scene.hintShaft.material.color));
  assert.ok(game.move('right'));
  scene.sync(game.state, true);
  assert.ok(game.move('right'));
  scene.sync(game.state, false, { action: 'push', direction: 'right' });
  scene.updateHintArrow(1500);
  assert.ok(meshes.every((mesh) => mesh.visible), 'Толчок не прячет стрелку');
  scene.reduceMotion = true;
  scene.updateHintArrow(2000);
  assert.equal(scene.hintFlowStrength.value, 0);
  const stillPhase = scene.hintFlowTime.value;
  scene.updateHintArrow(3000);
  assert.equal(scene.hintFlowTime.value, stillPhase);
  assert.ok(meshes.every((mesh) => mesh.visible));
});

test('Учебная стрелка идёт через поворот к ключевой позиции и перестраивает единую ленту', () => {
  const { scene } = setup();
  const game = new Game(levels[2].map);
  scene.load(game.map, game.state, { tutorial: true });
  assert.deepEqual(scene.hint.to, { x: 3, y: 3 });
  assert.equal(scene.hintShaft.geometry.attributes.position.count, 6);
  const distances = [...scene.hintShaft.geometry.attributes.routeDistance.array];
  assert.equal(distances[0], 0);
  for (let i = 0; i < distances.length; i += 2) {
    assert.equal(distances[i], distances[i + 1], 'Блик пересекает всю ширину ленты');
    if (i > 0) assert.ok(distances[i] > distances[i - 2], 'Блик продолжается за поворотом');
  }
  assert.ok(Math.abs(scene.hintRouteLength.value - distances.at(-1)) < .000001,
    'Блик движется по полной длине ленты, включая поворот');
  assert.equal(scene.hintHead.geometry.attributes.routeDistance, undefined, 'Наконечник не участвует в анимации');
  const tip = scene.hintTip.position.clone().add(scene.hintArrow.position);
  assert.ok(tip.distanceTo(scene.position(scene.hint.to, .075)) < .081);
  assert.equal(scene.hintTip.rotation.y, 0);
  scene.hint = { boxIndex: 0, from: { x: 6, y: 2 }, to: { x: 3, y: 2 },
    path: [{ x: 6, y: 2 }, { x: 5, y: 2 }, { x: 4, y: 2 }, { x: 3, y: 2 }] };
  scene.updateHintArrow();
  assert.equal(scene.hintShaft.geometry.attributes.position.count, 4);
});

test('Стыки ленты сохраняют ширину при разных углах во время движения сундука', () => {
  const { scene } = setup();
  const game = new Game(levels[2].map);
  scene.load(game.map, game.state, { tutorial: true });
  const corner = scene.position({ x: 3, y: 2 }, .075);
  for (const degrees of [0, 15, 30, 45, 60, 75, -15, -30, -45, -60]) {
    const angle = THREE.MathUtils.degToRad(degrees);
    const origin = corner.clone().add(new THREE.Vector3(Math.cos(angle) * 2, 0, -Math.sin(angle) * 2));
    scene.boxes[0].position.copy(origin);
    scene.updateHintArrow();
    const geometry = scene.hintShaft.geometry;
    const left = new THREE.Vector3().fromBufferAttribute(geometry.attributes.position, 2);
    const right = new THREE.Vector3().fromBufferAttribute(geometry.attributes.position, 3);
    const width = left.clone().sub(right);
    const incoming = corner.clone().sub(origin).normalize();
    const incomingNormal = new THREE.Vector3(-incoming.z, 0, incoming.x);
    assert.ok(Math.abs(width.dot(incomingNormal) - .085) < .000001, `${degrees}°: ширина входящего участка`);
    assert.ok(Math.abs(width.dot(new THREE.Vector3(-1, 0, 0)) - .085) < .000001, `${degrees}°: ширина исходящего участка`);
    assert.ok(left.clone().add(right).multiplyScalar(.5).distanceTo(corner.clone().sub(origin)) < .000001);
    assert.deepEqual([...geometry.index.array], [0, 1, 2, 1, 3, 2, 2, 3, 4, 3, 5, 4], 'Оба участка используют одну пару вершин стыка');
    assert.ok([...geometry.attributes.position.array].every(Number.isFinite));
  }
  scene.boxes[0].position.copy(corner);
  scene.updateHintArrow();
  assert.equal(scene.hintShaft.geometry.attributes.position.count, 4);
  assert.ok([...scene.hintShaft.geometry.attributes.position.array].every(Number.isFinite));
});

test('Тупиковый сундук плавно каменеет; отмена и перезапуск возвращают материал', (t) => {
  let now = 100;
  t.mock.method(performance, 'now', () => now);
  const { scene } = setup();
  const game = new Game(['#######', '#     #', '# $ @.#', '#     #', '#######']);
  scene.load(game.map, game.state, { tutorial: true });
  assert.ok(scene.hintArrow.visible);
  assert.equal(scene.boxes[0].userData.chest.stoneProgress, 0);
  for (const direction of ['down', 'left', 'left', 'up']) assert.ok(game.move(direction));
  scene.sync(game.state, false, { action: 'push', direction: 'up' });
  const data = scene.boxes[0].userData.chest;
  assert.equal(scene.hintArrow.visible, false);
  assert.equal(data.stoneProgress, 0);
  now = data.stoneTransition.start + 425;
  scene.frame(now);
  assert.ok(Math.abs(data.stoneProgress - .5) < .001);
  assert.ok(data.materials[1].metalness < data.baseSurfaces[1].metalness);
  now += 425;
  scene.frame(now);
  assert.equal(data.stoneProgress, 1);
  assert.equal(data.stoneUniforms.chestStone.value, 1);
  assert.equal(data.mossTarget, 0, 'Сундук вдоль тупиковой стены ещё можно сдвинуть вбок');
  assert.ok(data.materials.every((material) => material.roughness === 1 && material.metalness === 0));
  assert.ok(game.undo());
  scene.sync(game.state, false, { action: 'undo' });
  assert.ok(scene.hintArrow.visible);
  now = data.stoneTransition.start + 850;
  scene.frame(now);
  assert.equal(data.stoneProgress, 0);
  assert.equal(data.stoneUniforms.chestStone.value, 0);
  assert.ok(data.materials[0].color.equals(data.baseColors[0]));
  assert.ok(game.move('up'));
  scene.reduceMotion = true;
  scene.sync(game.state);
  assert.equal(data.stoneProgress, 1);
  assert.equal(data.stoneTransition, null);
  game.restart();
  scene.sync(game.state, true);
  assert.equal(data.stoneProgress, 0);
  scene.load(game.map, game.state);
  assert.equal(scene.hintArrow.visible, false, 'Вне учебных уровней стрелки выключены');
});

test('Мох появляется только на неподвижном камне и исчезает вместе с трещинами при отмене', (t) => {
  let now = 100;
  t.mock.method(performance, 'now', () => now);
  const { scene } = setup();
  const game = new Game(['########', '# $  . #', '# @    #', '#      #', '########']);
  scene.load(game.map, game.state);
  const data = scene.boxes[0].userData.chest;
  assert.equal(data.stoneProgress, 0);
  assert.equal(data.mossProgress, 0);
  const corner = { ...game.state, boxes: [{ x: 1, y: 1 }] };
  scene.sync(corner, false, { action: 'push', direction: 'left' });
  assert.equal(data.mossTarget, 1);
  now = data.mossTransition.start + 600;
  scene.frame(now);
  assert.ok(Math.abs(data.mossProgress - .5) < .001);
  assert.equal(data.stoneUniforms.chestMoss.value, data.mossProgress);
  now += 600;
  scene.frame(now);
  assert.equal(data.mossProgress, 1);
  scene.sync(game.state, false, { action: 'undo' });
  now = data.mossTransition.start + 850;
  scene.frame(now);
  assert.equal(data.stoneUniforms.chestStone.value, 0);
  assert.equal(data.stoneUniforms.chestMoss.value, 0);
  scene.reduceMotion = true;
  scene.sync(corner);
  assert.equal(data.stoneUniforms.chestMoss.value, 1);
  assert.equal(data.mossTransition, null);
  scene.sync(game.state, true);
  assert.equal(data.stoneUniforms.chestMoss.value, 0);
});

test('основание и мебель повторяют контур Microban без заполнения внешних пустот', () => {
  const { scene } = setup();
  const game = new Game(['####', '# .#', '#  ###', '#*@  #', '#  $ #', '#  ###', '####']);
  scene.load(game.map, game.state);
  const expected = [...game.map.floor, ...game.map.walls.map(cellKey)].sort();
  const bases = scene.room.children.filter((object) => object.userData.baseCell);
  assert.deepEqual(bases.map((object) => cellKey(object.userData.baseCell)).sort(), expected);
  assert.ok(bases.every((object) => object.geometry.parameters.width === 1 && object.geometry.parameters.depth === 1));
  const covered = [...scene.perimeter, ...scene.obstacles].flatMap((object) => object.userData.cells.map(cellKey));
  assert.deepEqual(covered.sort(), game.map.walls.map(cellKey).sort());
  assert.equal(perimeterSide(game.map, { x: 3, y: 1 }), 'right', 'Уступ входит в передний край');
  assert.ok(scene.perimeter.find((object) => object.userData.cells.some(({ x, y }) => x === 3 && y === 1)).userData.front);
  scene.clearRoom();
});

test('Сундук и подошвы героя опираются на пол после хода, отмены и перезапуска', () => {
  const { scene, game } = setup();
  scene.reduceMotion = true;
  const check = () => {
    for (const object of [scene.player, ...scene.boxes]) {
      assert.ok(Math.abs(new THREE.Box3().setFromObject(object).min.y - .02) < 1e-6);
    }
  };
  check();
  game.move('right');
  scene.sync(game.state, false, { action: 'walk', direction: 'right' });
  check();
  game.move('right');
  scene.sync(game.state, false, { action: 'push', direction: 'right' });
  check();
  game.undo();
  scene.sync(game.state, false, { action: 'undo' });
  check();
  game.restart();
  scene.sync(game.state, true);
  check();
});

test('В центре корпуса нет перекрытия, а крышка имеет внутренний свод', () => {
  const scene = Object.create(RoomScene.prototype);
  const chest = scene.createMovableChest();
  chest.updateMatrixWorld(true);
  const body = chest.children.filter((child) => child.isMesh);
  const ray = new THREE.Raycaster(new THREE.Vector3(0, 2, 0), new THREE.Vector3(0, -1, 0));
  assert.equal(ray.intersectObjects(body, false)[0].object.name, 'chest-floor');
  const inside = new THREE.Vector3(0, (.495 - .105 - .05) * 1.27, 0);
  ray.set(inside, new THREE.Vector3(0, 1, 0));
  const vault = ray.intersectObject(chest.userData.chest.lid, true)[0];
  assert.ok(vault.distance > .18 && vault.distance < .3);
});

test('Крышка и замок остаются внутри клетки на всём пути, дно тоже золотое', () => {
  const scene = Object.create(RoomScene.prototype);
  const chest = scene.createMovableChest();
  const vertex = new THREE.Vector3();
  for (let step = 0; step <= 100; step++) {
    scene.setChestProgress(chest, step / 100);
    chest.updateMatrixWorld(true);
    chest.traverse((mesh) => {
      if (!mesh.geometry) return;
      const positions = mesh.geometry.attributes.position;
      for (let i = 0; i < positions.count; i++) {
        vertex.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld);
        assert.ok(Math.abs(vertex.x) <= .5 && Math.abs(vertex.z) <= .5,
          `Поза ${step}%: ${vertex.toArray()}`);
      }
    });
    assert.equal(chest.userData.chest.lid.scale.x, 1);
  }
  for (const material of chest.userData.chest.materials) {
    assert.ok(material.emissiveIntensity > 0);
    assert.notEqual(material.color.getHex(), 0x322231);
  }
});

test('Сундук занимает клетку, открывается после прибытия и поднимает книги до прежней крышки', () => {
  let now;
  const { scene } = setup();
  const game = new Game(['#######', '#@$.  #', '# $ . #', '#######']);
  scene.load(game.map, game.state);
  const chest = scene.boxes[0];
  const data = chest.userData.chest;
  const closedBounds = new THREE.Box3().setFromObject(chest);
  const size = closedBounds.getSize(new THREE.Vector3());
  assert.ok(size.x > .9 && size.x < 1);
  assert.ok(size.z > .8 && size.z < 1);
  assert.equal(data.books.visible, false);
  const closedColor = data.materials[0].color.clone();
  assert.equal(game.move('right'), true);
  scene.sync(game.state, false, { action: 'push', direction: 'right' });
  const arrival = scene.animation.start + scene.animation.duration;
  scene.frame(arrival - 1);
  assert.equal(data.progress, 0);
  now = arrival + 450;
  scene.frame(now);
  assert.ok(data.progress > 0 && data.progress < 1);
  assert.ok(data.lid.rotation.x < 0);
  assert.equal(data.books.visible, true);
  now = arrival + 901;
  scene.frame(now);
  assert.equal(data.progress, 1);
  assert.equal(data.lid.scale.x, 1);
  assert.ok(Math.abs(data.lid.rotation.x + THREE.MathUtils.degToRad(88)) < 1e-6);
  const booksBounds = new THREE.Box3().setFromObject(data.books);
  assert.ok(Math.abs(booksBounds.max.y - closedBounds.max.y) < .025);
  assert.notEqual(data.materials[0].color.getHex(), closedColor.getHex());
  assert.ok(data.materials[0].emissiveIntensity > .3);
  assert.equal(data.transition, null);
  assert.equal(scene.goalMeshes[0].userData.occupied, true);
});

test('Сдвиг разворачивает незавершённое открытие, отмена открывает, перезапуск закрывает', () => {
  let now;
  const { scene } = setup();
  const game = new Game(['#######', '#@$.  #', '# $ . #', '#######']);
  scene.load(game.map, game.state);
  const data = scene.boxes[0].userData.chest;
  game.move('right');
  scene.sync(game.state, false, { action: 'push', direction: 'right' });
  data.transition.start = performance.now() - 600;
  now = performance.now();
  scene.frame(now);
  const partial = data.progress;
  game.move('right');
  scene.sync(game.state, false, { action: 'push', direction: 'right' });
  assert.ok(Math.abs(data.progress - partial) < .02);
  assert.equal(data.transition.from, data.progress);
  assert.equal(data.transition.to, 0);
  now = data.transition.start + 301;
  scene.frame(now);
  assert.equal(data.progress, 0);
  assert.equal(data.books.visible, false);
  assert.equal(Math.abs(data.lid.rotation.x), 0);
  assert.equal(data.lid.scale.x, 1);
  assert.equal(data.materials[0].emissiveIntensity, 0);
  game.undo();
  scene.sync(game.state, false, { action: 'undo' });
  now = data.transition.start + 901;
  scene.frame(now);
  assert.equal(data.progress, 1);
  game.restart();
  scene.sync(game.state, true);
  assert.equal(data.progress, 0);
  assert.equal(data.transition, null);
});

test('Начальная постановка на печать и уменьшение движения сразу устанавливают состояние сундука', () => {
  const { scene } = setup();
  const game = new Game(['#######', '#@*   #', '# $ . #', '#######']);
  scene.load(game.map, game.state);
  const data = scene.boxes[0].userData.chest;
  assert.equal(data.progress, 1);
  assert.equal(data.books.visible, true);
  scene.reduceMotion = true;
  game.move('right');
  scene.sync(game.state, false, { action: 'push', direction: 'right' });
  assert.equal(data.progress, 0);
  assert.equal(data.transition, null);
  scene.frame(2000);
  assert.equal(scene.goalMeshes[0].userData.rays.scale.y, 1);
});

test('Последовательные отмены восстанавливают повороты; новый ход и перезапуск обновляют историю', () => {
  for (const reduceMotion of [false, true]) {
    const { scene, game } = setup();
    scene.reduceMotion = reduceMotion;
    const move = (direction) => {
      assert.equal(game.move(direction), true);
      scene.sync(game.state, false, { action: 'walk', direction });
    };
    const undo = (expected) => {
      assert.equal(game.undo(), true);
      scene.sync(game.state, false, { action: 'undo' });
      assert.equal(scene.facing, expected);
      if (reduceMotion) assert.equal(scene.player.rotation.y, expected);
    };
    move('right');
    move('down');
    move('left');
    undo(0);
    undo(Math.PI / 2);
    undo(0);
    assert.equal(scene.facingHistory.length, 0);
    move('down');
    move('right');
    undo(0);
    move('up');
    undo(0);
    undo(0);
    // Неудачная попытка может повернуть героя, но не добавляет ход в историю.
    scene.blockedPush('up', false);
    move('right');
    undo(Math.PI);
    move('down');
    game.restart();
    scene.sync(game.state, true);
    assert.equal(scene.facingHistory.length, 0);
    const restartFacing = scene.facing;
    move('right');
    undo(restartFacing);
    if (!reduceMotion) {
      const start = scene.action.start;
      advance(scene, start, start + 1000);
      assert.ok(Math.abs(Math.sin((scene.player.rotation.y - restartFacing) / 2)) < .001);
    }
  }
});

test('Мышь меняет наклон, ограничивает углы и завершает захват', (t) => {
  const scene = Object.create(RoomScene.prototype);
  scene.camera = new THREE.PerspectiveCamera(32, 1, .1, 100);
  scene.verticalAngle = 43;
  scene.fitCamera();
  const handlers = new Map();
  const classes = new Set();
  let captured = null;
  scene.renderer = { domElement: {
    addEventListener: (name, handler) => handlers.set(name, handler),
    classList: { add: (name) => classes.add(name), remove: (name) => classes.delete(name) },
    setPointerCapture: (id) => { captured = id; },
    hasPointerCapture: (id) => captured === id,
    releasePointerCapture: () => { captured = null; },
  } };
  const logs = [];
  t.mock.method(console, 'log', (message) => logs.push(message));
  scene.setupMouseControls();
  const send = (name, values = {}) => handlers.get(name)({ pointerId: 1, button: 0, clientY: 200, ...values });
  send('pointerdown', { button: 2 });
  assert.equal(captured, null);
  send('pointerdown');
  assert.equal(captured, 1);
  assert.ok(classes.has('is-dragging'));
  send('pointermove', { pointerId: 2, clientY: 0 });
  assert.equal(scene.verticalAngle, 43);
  send('pointermove', { clientY: 100 });
  assert.equal(scene.verticalAngle, 23);
  assert.deepEqual(logs, [], 'Жест камеры не пишет отладочные сообщения');
  const direction = scene.camera.getWorldDirection(new THREE.Vector3());
  assert.ok(Math.abs(direction.x / direction.z - .75) < 1e-10);
  send('pointermove', { clientY: -1000 });
  assert.equal(scene.verticalAngle, 15);
  send('pointermove', { clientY: 1000 });
  assert.equal(scene.verticalAngle, 85);
  send('pointerup');
  assert.equal(captured, null);
  assert.equal(classes.size, 0);
  send('pointermove', { clientY: 0 });
  assert.equal(scene.verticalAngle, 85);
  for (const end of ['pointercancel', 'lostpointercapture']) {
    send('pointerdown');
    send(end);
    assert.equal(captured, null);
    assert.equal(classes.size, 0);
  }
});

test('Свайп даёт один ход, а два пальца меняют только наклон', () => {
  const scene = Object.create(RoomScene.prototype);
  scene.camera = new THREE.PerspectiveCamera(32, 1, .1, 100);
  scene.verticalAngle = 43;
  scene.fitCamera();
  scene.fitCamera = () => {};
  scene.logCameraAngles = () => {};
  const handlers = new Map();
  const captured = new Set();
  scene.renderer = { domElement: {
    addEventListener: (name, handler) => handlers.set(name, handler),
    classList: { add() {}, remove() {} },
    setPointerCapture: (id) => captured.add(id),
    hasPointerCapture: (id) => captured.has(id),
    releasePointerCapture: (id) => captured.delete(id),
  } };
  const moves = [];
  scene.onMove = (direction) => moves.push(direction);
  scene.setupMouseControls();
  const send = (type, values = {}) => handlers.get(type)({ type, pointerType: 'touch', pointerId: 1, button: 0, clientX: 100, clientY: 200, ...values });
  for (const [direction, dx, dy] of [['right', 40, 5], ['left', -40, 5], ['down', 5, 40], ['up', 5, -40]]) {
    send('pointerdown');
    send('pointermove', { clientX: 100 + dx, clientY: 200 + dy });
    assert.equal(scene.verticalAngle, 43);
    send('pointerup', { clientX: 100 + dx, clientY: 200 + dy });
    assert.equal(moves.at(-1), direction);
  }
  assert.equal(moves.length, 4);
  send('pointerdown');
  send('pointerup', { clientX: 123 });
  assert.equal(moves.length, 4);
  send('pointerdown');
  send('pointerdown', { pointerId: 2 });
  send('pointermove', { clientY: 100 });
  send('pointermove', { pointerId: 2, clientY: 100 });
  assert.equal(scene.verticalAngle, 23);
  send('pointermove', { clientY: -2000 });
  assert.equal(scene.verticalAngle, 15);
  send('pointermove', { clientY: 3000 });
  assert.equal(scene.verticalAngle, 85);
  send('pointerup', { pointerId: 2 });
  send('pointermove', { clientX: 180 });
  send('pointerup', { clientX: 180 });
  assert.equal(moves.length, 4);
  assert.equal(captured.size, 0);
  for (const ending of ['pointercancel', 'lostpointercapture']) {
    send('pointerdown');
    send(ending, { clientY: 100 });
    assert.equal(moves.length, 4);
  }
  send('pointerdown');
  send('pointerdown', { pointerId: 2 });
  send('pointerdown', { pointerId: 3 });
  send('pointermove', { clientY: 100 });
  assert.equal(scene.verticalAngle, 85);
  scene.cancelControls();
  assert.equal(captured.size, 0);
  send('pointerup', { clientY: 100 });
  assert.equal(moves.length, 4);
  scene.controlsEnabled = false;
  send('pointerdown');
  send('pointerup', { clientX: 180 });
  assert.equal(moves.length, 4);
  scene.controlsEnabled = true;
  send('pointerdown');
  send('pointerup', { clientX: 180 });
  assert.equal(moves.length, 5);
});

test('Свайп следует видимым осям поля при разных наклонах, пропорциях экрана и положениях героя', () => {
  const scene = Object.create(RoomScene.prototype);
  scene.camera = new THREE.PerspectiveCamera(32, 1, .1, 100);
  for (const aspect of [.5, 1, 2]) for (const angle of [15, 43, 65, 85]) {
    scene.camera.aspect = aspect;
    scene.container = { clientWidth: 400 * aspect, clientHeight: 400 };
    scene.verticalAngle = angle;
    scene.fitCamera();
    scene.camera.updateMatrixWorld(true);
    for (const [x, z] of [[0, 0], [-3, -3], [3, 3]]) {
      scene.player = { position: new THREE.Vector3(x, .3, z) };
      const origin = new THREE.Vector3(x, 0, z).project(scene.camera);
      for (const [name, dx, dz] of [['right', 1, 0], ['left', -1, 0], ['down', 0, 1], ['up', 0, -1]]) {
        const end = new THREE.Vector3(x + dx, 0, z + dz).project(scene.camera);
        const swipe = new THREE.Vector2((end.x - origin.x) * aspect, -(end.y - origin.y)).setLength(60);
        assert.equal(scene.swipeDirection(swipe.x, swipe.y), name,
          `${aspect}, ${angle}°, (${x}, ${z}): ${name}`);
      }
    }
  }
  scene.camera.aspect = 1;
  scene.container = { clientWidth: 400, clientHeight: 400 };
  scene.player.position.set(0, 0, 0);
  scene.verticalAngle = 15;
  scene.fitCamera();
  assert.equal(scene.swipeDirection(-60, 30), 'down', 'Диагональ влево-вниз следует глубине поля');
  assert.equal(scene.swipeDirection(60, -30), 'up', 'Диагональ вправо-вверх следует глубине поля');
});

test('Касания вне канвы и на кнопках управляют полем, сохраняя тап и подавляя клик после жеста', () => {
  const scene = Object.create(RoomScene.prototype);
  scene.camera = new THREE.PerspectiveCamera(32, 1, .1, 100);
  scene.verticalAngle = 43;
  scene.fitCamera();
  scene.logCameraAngles = () => {};
  const handlers = new Map();
  const surface = { addEventListener: (name, handler) => handlers.set(name, handler) };
  const captured = new Set();
  const button = {
    setPointerCapture: (id) => captured.add(id),
    hasPointerCapture: (id) => captured.has(id),
    releasePointerCapture: (id) => captured.delete(id),
  };
  scene.renderer = { domElement: { classList: { add() {}, remove() {} } } };
  const moves = [];
  scene.onMove = (direction) => moves.push(direction);
  scene.setupMouseControls(surface);
  const send = (type, values = {}) => handlers.get(type)({
    type, target: button, pointerType: 'touch', pointerId: 1, button: 0,
    clientX: 100, clientY: 100, ...values,
  });
  const click = (values = {}) => {
    let prevented = false;
    let stopped = false;
    send('click', { detail: 1, preventDefault: () => { prevented = true; },
      stopImmediatePropagation: () => { stopped = true; }, ...values });
    assert.equal(prevented, stopped);
    return prevented;
  };
  send('pointerdown');
  assert.ok(captured.has(1));
  send('pointerup');
  assert.equal(click(), false, 'Тап нажимает кнопку');
  assert.equal(moves.length, 0);
  send('pointerdown');
  send('pointerup', { clientX: 160 });
  assert.deepEqual(moves, ['right']);
  assert.equal(captured.size, 0);
  assert.equal(click({ detail: 0 }), false, 'Клавиатурное нажатие сохраняется');
  assert.equal(click(), true, 'Свайп не нажимает кнопку');
  send('pointerdown');
  send('pointerdown', { pointerId: 2 });
  send('pointermove', { clientY: 150 });
  send('pointermove', { pointerId: 2, clientY: 150 });
  assert.equal(scene.verticalAngle, 53);
  send('pointerup', { pointerId: 2, clientY: 150 });
  send('pointerup', { clientY: 150 });
  assert.equal(click({ pointerId: 2 }), true);
  assert.equal(click(), true);
  assert.equal(moves.length, 1);
  send('pointerdown', { pointerType: 'mouse' });
  assert.equal(captured.size, 0, 'Мышь вне канвы не наклоняет камеру');
  scene.controlsEnabled = false;
  send('pointerdown');
  send('pointerup', { clientX: 160 });
  assert.equal(moves.length, 1, 'Открытое меню блокирует жесты');
  assert.equal(click(), false, 'Кнопки меню доступны');
});

test('Комната заполняет кадр без запаса и обрезания при разных наклонах и пропорциях экрана', () => {
  const scene = Object.create(RoomScene.prototype);
  scene.camera = new THREE.PerspectiveCamera(32, 1, .1, 100);
  scene.map = { width: 12, height: 8 };
  scene.roomHeight = 2;
  for (const aspect of [.5, 1, 2]) for (const angle of [15, 43, 85]) {
    scene.camera.aspect = aspect;
    scene.verticalAngle = angle;
    scene.fitCamera();
    scene.camera.updateMatrixWorld(true);
    let edge = 0;
    for (const x of [-6.3, 6.3]) for (const z of [-4.3, 4.3]) for (const y of [-.5, 2]) {
      const point = new THREE.Vector3(x, y, z).project(scene.camera);
      edge = Math.max(edge, Math.abs(point.x), Math.abs(point.y));
      assert.ok(Math.abs(point.x) <= 1 + 1e-10 && Math.abs(point.y) <= 1 + 1e-10 && Math.abs(point.z) < 1,
        `Угол ${angle}°, пропорции ${aspect}: границы комнаты видны`);
    }
    assert.ok(Math.abs(edge - 1) < 1e-10, 'Комната касается края канвы');
  }
});

test('Плотное кадрирование сохраняет предметы и запас для ходов при повороте и смене экрана', () => {
  const { scene, game } = setup();
  scene.camera = new THREE.PerspectiveCamera(32, 1, .1, 100);
  const points = scene.cameraFitPoints;
  assert.ok(points.length > 8, 'Учитываем отдельные предметы и игровые клетки');
  for (const aspect of [.5, 1, 2]) for (const angle of [15, 38, 85]) {
    scene.camera.aspect = aspect;
    scene.verticalAngle = angle;
    scene.fitCamera();
    scene.camera.updateMatrixWorld(true);
    for (const corner of points) {
      const point = corner.clone().project(scene.camera);
      assert.ok(Math.abs(point.x) <= 1 + 1e-10 && Math.abs(point.y) <= 1 + 1e-10 && Math.abs(point.z) < 1,
        `Угол ${angle}°, пропорции ${aspect}: предметы и запас для ходов видны`);
    }
  }
  scene.camera.aspect = .625;
  scene.verticalAngle = 38;
  scene.fitCamera();
  const direction = scene.camera.getWorldDirection(new THREE.Vector3()).negate();
  const tightDistance = scene.camera.position.dot(direction);
  scene.cameraFitPoints = undefined;
  scene.fitCamera();
  assert.ok(tightDistance < scene.camera.position.dot(direction), 'Камера приближается по сравнению с общим объёмом');
  scene.cameraFitPoints = points;
  scene.load(game.map, game.state);
  assert.notEqual(scene.cameraFitPoints, points, 'Новая комната перестраивает границы кадра');
});

test('Горизонтальный угол линейно стремится к 5° только выше исходного наклона', () => {
  const scene = Object.create(RoomScene.prototype);
  scene.camera = new THREE.PerspectiveCamera(32, 1, .1, 100);
  const initial = THREE.MathUtils.radToDeg(Math.atan2(.6, .8));
  for (const [vertical, horizontal] of [[15, initial], [sceneConfig.initialVerticalAngle, initial],
    [(sceneConfig.initialVerticalAngle + 85) / 2, (initial + 5) / 2], [85, 5], [23, initial]]) {
    scene.verticalAngle = vertical;
    scene.fitCamera();
    const direction = scene.camera.getWorldDirection(new THREE.Vector3());
    const actual = THREE.MathUtils.radToDeg(Math.atan2(-direction.x, -direction.z));
    assert.ok(Math.abs(actual - horizontal) < 1e-10);
  }
});

test('Все варианты преград помещаются в клетку при крайних значениях случайного выбора', (t) => {
  let random = 0;
  setRandom(t, () => random);
  const { scene } = setup();
  for (const value of [0, .25, .5, .75, .999999]) {
    random = value;
    for (const variant of ['stack', 'upright', 'upright-no-frame', 'pyramid', 'coffee-table', 'cabinet']) {
      const obstacle = scene.createObstacle(variant);
      const bounds = new THREE.Box3().setFromObject(obstacle);
      assert.ok(bounds.min.x >= -.48 && bounds.max.x <= .48, `${variant}: границы X`);
      assert.ok(bounds.min.z >= -.48 && bounds.max.z <= .48, `${variant}: границы Z`);
      assert.ok(Math.abs(Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x)) - .47) < .000001,
        `${variant}: занимает почти всю ширину плитки`);
      assert.ok(Math.abs(Math.max(Math.abs(bounds.min.z), Math.abs(bounds.max.z)) - .47) < .000001,
        `${variant}: занимает почти всю глубину плитки`);
      assert.ok(bounds.min.y >= -.000001 && bounds.max.y <= .8, `${variant}: высота`);
    }
  }
});

test('Верхняя книга у книг стоя сохраняет обычные пропорции и не закрывает весь ряд', (t) => {
  let random = 0;
  setRandom(t, () => random);
  const { scene } = setup();
  for (const value of [0, .5, .999999]) {
    random = value;
    for (const variant of ['upright', 'upright-no-frame']) for (const span of [1, 2]) {
      const model = scene.createObstacle(variant, span);
      // Проверяем размеры в системе координат мебели до её случайного разворота.
      model.rotation.y = 0;
      model.updateMatrixWorld(true);
      const top = model.children.at(-1);
      const cover = top.children[1];
      const xEdge = new THREE.Vector3(.3, 0, 0).applyMatrix4(cover.matrixWorld)
        .sub(new THREE.Vector3().applyMatrix4(cover.matrixWorld));
      const zEdge = new THREE.Vector3(0, 0, .44).applyMatrix4(cover.matrixWorld)
        .sub(new THREE.Vector3().applyMatrix4(cover.matrixWorld));
      assert.ok(Math.abs(xEdge.length() / zEdge.length() - 2 / 3) < 1e-6);
      const topBounds = new THREE.Box3().setFromObject(top);
      assert.ok(Math.abs(topBounds.getSize(new THREE.Vector3()).y - .08) < 1e-6, 'Толщина сохранена');
      const standingBounds = new THREE.Box3();
      for (const part of model.children.filter((part) => part.isGroup && part !== top)) {
        standingBounds.union(new THREE.Box3().setFromObject(part));
      }
      assert.ok(topBounds.min.x > standingBounds.min.x && topBounds.max.x < standingBounds.max.x,
        'Книги по краям ряда видимы');
      assert.ok(topBounds.min.z <= standingBounds.min.z && topBounds.max.z >= standingBounds.max.z,
        'Длинная сторона перекрывает глубину ряда');
    }
  }
});

test('Мебель заменяет внутренние стены, сохраняет разнообразие и остаётся на месте при ходе и отмене', () => {
  const { scene } = setup();
  const game = new Game(['########', '#@ $  .#', '# ###  #', '# ##   #', '#      #', '########']);
  scene.load(game.map, game.state);
  assert.equal(scene.obstacles.length, 5);
  assert.ok(new Set(scene.obstacles.map((object) => object.userData.variant)).size >= 3);
  const obstacles = scene.obstacles.slice();
  const positions = obstacles.map((object) => object.position.clone());
  assert.equal(game.map.floor.has('2,2'), false, 'Преграда остаётся непроходимой');
  assert.equal(game.move('right'), true);
  assert.equal(game.move('down'), false, 'Герой не проходит сквозь мебель');
  scene.sync(game.state, true);
  game.undo();
  scene.sync(game.state, true);
  assert.deepEqual(scene.obstacles, obstacles);
  scene.obstacles.forEach((object, index) => assert.ok(object.position.equals(positions[index])));
});

test('Случайный выбор разделяет мебель книгами по горизонтали и вертикали', (t) => {
  let random = 0;
  setRandom(t, () => random);
  const { scene } = setup();
  const game = new Game([
    '##########', '#@ $    .#', '# ###### #', '# ###### #', '# ###### #', '#        #', '##########',
  ]);
  for (const value of [0, .25, .5, .75, .999999]) {
    random = value;
    scene.load(game.map, game.state);
    const covered = scene.obstacles.flatMap((object) => object.userData.cells.map(cellKey));
    assert.equal(covered.length, 18);
    assert.equal(new Set(covered).size, 18);
    assert.ok(scene.obstacles.some((object) => object.userData.span === 2));
    const furniture = scene.obstacles.filter((object) => ['coffee-table', 'cabinet'].includes(object.userData.variant));
    assert.ok(furniture.length > 0, 'Мебель остаётся в случайном наборе');
    for (let i = 0; i < furniture.length; i++) for (let j = i + 1; j < furniture.length; j++) {
      assert.ok(furniture[i].userData.cells.every((a) => furniture[j].userData.cells.every((b) =>
        Math.abs(a.x - b.x) + Math.abs(a.y - b.y) > 1)), 'Мебель не стоит на соседних клетках');
    }
    const books = scene.obstacles.filter((object) => !furniture.includes(object));
    assert.ok(books.some((a) => books.some((b) => a !== b && a.userData.cells.some((c) => b.userData.cells.some((d) => Math.abs(c.x - d.x) + Math.abs(c.y - d.y) === 1)))),
      'Книжные преграды могут стоять рядом');
  }
});

test('Сцена сообщает о готовности один раз после перемещения, не ожидая завершения позы', () => {
  for (const [action, duration] of [['walk', 180], ['push', 370], ['undo', 320]]) {
    const { scene, game } = setup();
    let calls = 0;
    scene.onIdle = () => {
      assert.equal(scene.busy, false);
      calls++;
    };
    scene.sync(game.state, false, { action });
    const start = scene.action.start;
    scene.frame(start + duration - 1);
    assert.equal(calls, 0);
    scene.frame(start + duration + 1);
    assert.equal(calls, 1);
    scene.frame(start + duration + 2);
    assert.equal(calls, 1);
  }
});

test('Сцена сообщает о готовности после неудачного толчка', () => {
  const { scene } = setup();
  let calls = 0;
  scene.onIdle = () => { calls++; };
  scene.blockedPush('right', true);
  const start = scene.action.start;
  scene.frame(start + 419);
  assert.equal(calls, 0);
  scene.frame(start + 421);
  assert.equal(calls, 1);
  assert.equal(scene.action.type, 'shake');
});

test('Толчок сохраняет упор во время движения и плавно переходит в следующий ход', () => {
  const { scene, game } = setup();
  game.move('right');
  game.move('right');
  scene.sync(game.state, false, { action: 'push', direction: 'right' });
  const start = scene.action.start;
  const position = scene.player.position.clone();
  advance(scene, start, start + 100);
  assert.ok(scene.player.position.equals(position), 'Сначала герой упирается руками');
  // Чуть за границей кадра: дробный performance.now() даёт погрешность вычитания.
  advance(scene, start + 100, start + 370.001);
  assert.equal(scene.busy, false, 'Отпускание рук не задерживает управление');
  assert.equal(scene.action.type, 'push', 'Поза не сбрасывается в конце перемещения');
  assert.ok(scene.arms[0].rotation.x < -1.2);
  const arm = scene.arms[0].rotation.x;
  const lean = scene.rig.rotation.x;
  game.move('right');
  scene.sync(game.state, false, { action: 'push', direction: 'right' });
  assert.equal(scene.arms[0].rotation.x, arm);
  assert.equal(scene.rig.rotation.x, lean);
  scene.frame(scene.action.start + 16);
  assert.ok(Math.abs(scene.arms[0].rotation.x - arm) < .08);
});

test('Жесты простоя редкие, чередуются и прерываются без мгновенного сброса', () => {
  const { scene, game } = setup();
  assert.ok(scene.nextIdleAt - scene.lastMoveTime >= 16000);
  scene.frame(scene.nextIdleAt - 1);
  assert.equal(scene.action, null);
  scene.frame(scene.nextIdleAt);
  assert.equal(scene.action.type, 'hat');
  const start = scene.action.start;
  advance(scene, start, start + 900);
  assert.ok(scene.arms[1].rotation.x < -2);
  const arm = scene.arms[1].rotation.x;
  game.move('right');
  scene.sync(game.state);
  assert.equal(scene.action.type, 'walk');
  assert.equal(scene.arms[1].rotation.x, arm);
  scene.frame(scene.action.start + scene.action.duration + .001);
  scene.frame(scene.nextIdleAt);
  assert.equal(scene.action.type, 'look');
  assert.ok(scene.nextIdleAt - scene.action.start >= 20000);
});

test('При почёсывании рука обходит шляпу, в том числе при прерывании жеста', () => {
  for (const fps of [30, 60, 120]) for (const interruptAt of [null, 450, 900, 1350]) {
    const { scene } = setup();
    scene.action = { type: 'hat', start: 0, duration: 1800 };
    let interrupted = false;
    let maxTilt = 0;
    for (let time = 0; time <= 2300; time += 1000 / fps) {
      if (interruptAt !== null && !interrupted && time >= interruptAt) {
        scene.action = { type: 'walk', start: time, duration: 300 };
        interrupted = true;
      }
      scene.animatePlayer(time);
      maxTilt = Math.max(maxTilt, -scene.hatPivot.rotation.x);
      scene.scene.updateMatrixWorld(true);
      for (const mesh of scene.arms[1].children) {
        mesh.geometry.computeBoundingBox();
        const transform = new THREE.Matrix4().copy(scene.hatPivot.matrixWorld).invert().multiply(mesh.matrixWorld);
        const bounds = mesh.geometry.boundingBox.clone().applyMatrix4(transform);
        // Консервативная проверка: рамка руки в координатах шляпы против её цилиндров.
        const x = THREE.MathUtils.clamp(0, bounds.min.x, bounds.max.x);
        const z = THREE.MathUtils.clamp(0, bounds.min.z, bounds.max.z);
        for (const [radius, bottom, top] of [[.26, -.015, .015], [.19, -.01, .07]]) {
          const intersects = bounds.max.y > bottom && bounds.min.y < top && x * x + z * z < radius * radius;
          assert.equal(intersects, false, `Рука пересекает шляпу: ${fps} FPS, ${time} мс`);
        }
      }
    }
    assert.ok(maxTilt > .1, 'Шляпа наклоняется назад');
    assert.ok(Math.abs(scene.hatPivot.rotation.x) < .005, 'Шляпа плавно возвращается');
  }
});

test('Кивок следует за толчком; победа заменяет кивок; отмена отменяет жест', () => {
  const { scene, game } = setup();
  for (const complete of [false, true]) {
    scene.sync(game.state, false, { action: 'push', placedOnGoal: true, complete });
    const start = scene.action.start;
    advance(scene, start, start + 651);
    assert.equal(scene.action.type, complete ? 'victory' : 'nod');
    scene.sync(game.state, false, { action: 'undo' });
    assert.equal(scene.followup, null);
    assert.equal(scene.action.type, 'undo');
  }
});

test('Результат победы готов только после праздничного жеста и сообщается один раз', () => {
  const { scene, game } = setup();
  let calls = 0;
  scene.onVictory = () => {
    assert.equal(scene.victoryReady, true);
    assert.equal(scene.action, null);
    calls++;
  };
  scene.sync(game.state, false, { action: 'push', complete: true });
  const start = scene.action.start;
  assert.equal(scene.victoryReady, false);
  advance(scene, start, start + 651);
  assert.equal(scene.action.type, 'victory');
  const end = scene.action.start + scene.action.duration;
  advance(scene, start + 651, end - 1);
  assert.equal(scene.victoryReady, false);
  assert.equal(calls, 0);
  scene.frame(end);
  scene.frame(end + 16);
  assert.equal(calls, 1);
  scene.sync(game.state, false, { action: 'undo' });
  assert.equal(scene.victoryReady, false);
});

test('Отмена, перезапуск и загрузка комнаты отменяют отложенное сообщение о победе', () => {
  for (const cancel of ['undo', 'restart', 'load']) {
    const { scene, game } = setup();
    let calls = 0;
    scene.onVictory = () => { calls++; };
    scene.sync(game.state, false, { action: 'push', complete: true });
    const start = scene.action.start;
    advance(scene, start, start + 651);
    if (cancel === 'load') scene.load(game.map, game.state);
    else scene.sync(game.state, cancel === 'restart', { action: 'undo' });
    advance(scene, start + 651, start + 3000);
    assert.equal(calls, 0);
    assert.equal(scene.victoryReady, false);
  }
});

test('При уменьшении движения результат победы доступен сразу', () => {
  const { scene, game } = setup();
  scene.reduceMotion = true;
  scene.sync(game.state, false, { action: 'push', complete: true });
  assert.equal(scene.victoryReady, true);
  assert.equal(scene.action, null);
  assert.equal(scene.followup, null);
});

test('Потирание рук появляется после серии толчков и соблюдает паузу 20 секунд', () => {
  const { scene, game } = setup();
  for (let index = 0; index < 3; index++) scene.sync(game.state, false, { action: 'push' });
  const start = scene.action.start;
  advance(scene, start, start + 901);
  assert.equal(scene.action.type, 'rub');
  advance(scene, start + 901, start + 2100);
  scene.pendingRub = true;
  scene.frame(start + 3000);
  assert.equal(scene.action, null, 'Жест не повторяется сразу после серии');
});

test('Перезапуск и уменьшение движения исключают отложенные жесты', () => {
  const { scene, game } = setup();
  scene.sync(game.state, false, { action: 'push', complete: true });
  scene.sync(game.state, true);
  assert.equal(scene.followup, null);
  assert.equal(scene.action, null);
  assert.equal(scene.animation, null);
  scene.reduceMotion = true;
  scene.sync(game.state, false, { action: 'push', placedOnGoal: true });
  scene.blockedPush('up');
  scene.frame(scene.nextIdleAt + 100000);
  assert.equal(scene.action, null);
  assert.equal(scene.rig.rotation.x, 0);
  assert.ok(scene.arms.every((arm) => arm.rotation.x === 0));
});

test('Стена и заблокированный ящик вызывают оба варианта покачивания головы без изменения состояния', (t) => {
  let random = .25;
  setRandom(t, () => random);
  for (const axis of ['y', 'z']) {
    random = axis === 'y' ? .25 : .75;
    for (const pushing of [false, true]) {
      const { scene } = setup();
      const game = new Game(pushing ? ['#######', '#@$$..#', '#######'] : ['#####', '#@$.#', '#####']);
      scene.load(game.map, game.state);
      const before = game.state;
      const position = scene.player.position.clone();
      const direction = pushing ? 'right' : 'up';
      assert.equal(game.move(direction), false);
      scene.blockedPush(direction, pushing);
      if (pushing) {
        const start = scene.action.start;
        advance(scene, start, start + 421);
      }
      assert.equal(scene.action.type, 'shake');
      assert.equal(scene.action.axis, axis);
      const shake = scene.action;
      scene.blockedPush(direction, pushing);
      assert.equal(scene.action, shake, 'Повтор нажатия не перезапускает жест');
      let min = 0;
      let max = 0;
      for (let elapsed = 0; elapsed <= 700; elapsed += 10) {
        scene.frame(shake.start + elapsed);
        min = Math.min(min, scene.headPivot.rotation[axis]);
        max = Math.max(max, scene.headPivot.rotation[axis]);
        assert.equal(scene.headPivot.rotation[axis === 'y' ? 'z' : 'y'], 0);
      }
      assert.ok(min < -.08 && max > .08, 'Голова поворачивается в обе стороны');
      assert.ok(scene.player.position.equals(position));
      assert.deepEqual(game.state, before);
      assert.equal(game.canUndo, false);
      scene.frame(shake.start + 701);
      assert.equal(scene.action, null);
    }
  }
});

test('Перо закреплено на голове и меняет силуэт шляпы при обоих жестах', () => {
  const { scene } = setup();
  assert.equal(scene.feather.parent, scene.hatPivot);
  assert.equal(scene.hatPivot.parent, scene.headPivot);
  scene.scene.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(scene.feather);
  assert.ok(bounds.max.y > 1.3, 'Перо выступает над шляпой');
  const tip = new THREE.Vector3(.09, .55, 0);
  const initial = scene.feather.localToWorld(tip.clone());
  for (const axis of ['y', 'z']) {
    scene.headPivot.rotation.set(0, 0, 0);
    scene.headPivot.rotation[axis] = .2;
    const turned = scene.feather.localToWorld(tip.clone());
    assert.ok(turned.distanceTo(initial) > .03, 'Кончик пера заметно смещается');
  }
});

test('Наклон пера направлен к затылку при каждом направлении взгляда', () => {
  const { scene } = setup();
  for (const direction of ['up', 'down', 'left', 'right']) {
    scene.face(direction);
    scene.player.rotation.y = scene.facing;
    const root = scene.feather.localToWorld(new THREE.Vector3());
    const tip = scene.feather.localToWorld(new THREE.Vector3(.09, .55, 0));
    const vector = tip.sub(root);
    const forward = new THREE.Vector3(Math.sin(scene.facing), 0, Math.cos(scene.facing));
    assert.ok(vector.dot(forward) < -.18, 'Перо отклоняется в сторону, противоположную взгляду');
    assert.ok(vector.y > .45, 'Перо сохраняет приподнятый силуэт');
  }
});

test('Небольшие шаги видны, чередуются и плавно затухают после остановки', () => {
  const { scene, game } = setup();
  const sides = [];
  for (let index = 0; index < 2; index++) {
    game.move('down');
    scene.sync(game.state, false, { action: 'walk' });
    const start = scene.action.start;
    advance(scene, start, start + 150);
    const angle = scene.legs[0].rotation.x;
    assert.ok(Math.abs(angle) > .15 && Math.abs(angle) < .3);
    assert.ok(Math.abs(angle + scene.legs[1].rotation.x) < .001);
    sides.push(Math.sign(angle));
    advance(scene, start + 150, start + 650);
    assert.ok(Math.abs(scene.legs[0].rotation.x) < .005);
  }
  assert.equal(sides[0], -sides[1]);
});

test('При толкании ноги делают заметный шаг и чередуются при последовательных толчках', () => {
  for (const fps of [30, 60, 120]) {
    const { scene, game } = setup();
    const sides = [];
    for (let index = 0; index < 2; index++) {
      game.move('right');
      scene.sync(game.state, false, { action: 'push', direction: 'right' });
      const start = scene.action.start;
      const side = scene.walkSide;
      for (let elapsed = 0; elapsed < 260; elapsed += 1000 / fps) scene.frame(start + elapsed);
      scene.frame(start + 260);
      const stride = (scene.legs[0].rotation.x - scene.legs[1].rotation.x) / 2 - .11;
      assert.ok(Math.abs(stride) > .18, `${fps} FPS: шаг виден после сглаживания`);
      assert.equal(Math.sign(stride), side);
      assert.ok(scene.arms.every((arm) => arm.rotation.x < -1.1), 'Руки сохраняют упор');
      sides.push(Math.sign(stride));
      for (let elapsed = 260 + 1000 / fps; elapsed < 900; elapsed += 1000 / fps) scene.frame(start + elapsed);
      scene.frame(start + 900);
      assert.ok(scene.legs.every((leg) => Math.abs(leg.rotation.x) < .01), 'После остановки шаг затухает');
    }
    assert.equal(sides[0], -sides[1]);
  }
});

test('Пружина пера реагирует на шаги и оба вращения головы, затем затухает', () => {
  for (const motion of ['step', 'y', 'z']) {
    const { scene } = setup();
    let maximum = 0;
    for (let frame = 0; frame <= 36; frame++) {
      const time = frame / 60;
      const amount = Math.sin(Math.min(1, time / .6) * Math.PI) ** 2;
      if (motion === 'step') scene.player.position.x = amount * .5;
      else scene.headPivot.rotation[motion] = amount * .3;
      scene.animateFeather(time * 1000);
      maximum = Math.max(maximum, scene.featherSpring.bend.length());
    }
    assert.ok(maximum > .005 && maximum <= .280001, `${motion}: ограниченная инерция`);
    assert.ok(scene.featherSpring.velocity.length() > .001, 'После остановки инерция сохраняется');
    for (let frame = 37; frame <= 240; frame++) scene.animateFeather(frame / 60 * 1000);
    assert.ok(scene.featherSpring.bend.length() < .00001, 'В покое перо успокаивается');
    assert.ok(scene.featherSpring.velocity.length() < .0001);
  }
});

test('Изгиб пера оставляет основание неподвижным и одинаково деформирует опахало и стержень', () => {
  const { scene } = setup();
  scene.featherSpring.bend.set(.1, -.08);
  scene.bendFeather();
  for (const { geometry, rest } of scene.featherSurfaces) {
    const positions = geometry.attributes.position;
    let tipChanged = false;
    for (let index = 0; index < positions.count; index++) {
      const offset = index * 3;
      if (rest[offset + 1] <= .075) {
        assert.equal(positions.getX(index), rest[offset]);
        assert.equal(positions.getY(index), rest[offset + 1]);
        assert.equal(positions.getZ(index), rest[offset + 2]);
      } else if (rest[offset + 1] > .45) {
        tipChanged ||= positions.getX(index) > rest[offset] + .02;
      }
    }
    assert.ok(tipChanged);
  }
  scene.resetFeatherPhysics();
  for (const { geometry, rest } of scene.featherSurfaces) {
    assert.deepEqual(geometry.attributes.position.array, rest);
  }
});

test('Перо устойчиво при 30, 60 и 120 FPS; длинная пауза и перезапуск сбрасывают пружину', () => {
  const peaks = [];
  for (const fps of [30, 60, 120]) {
    const { scene, game } = setup();
    let peak = 0;
    for (let frame = 0; frame <= fps; frame++) {
      const time = frame / fps;
      scene.headPivot.rotation.z = Math.sin(time * Math.PI * 2) * .25;
      scene.animateFeather(time * 1000);
      peak = Math.max(peak, scene.featherSpring.bend.length());
      assert.ok(Number.isFinite(scene.featherSpring.bend.length()));
      assert.ok(scene.featherSpring.bend.length() <= .280001);
    }
    peaks.push(peak);
    scene.animateFeather(10000);
    assert.equal(scene.featherSpring.bend.length(), 0);
    assert.equal(scene.featherSpring.velocity.length(), 0);
    scene.featherSpring.bend.set(.1, .1);
    scene.bendFeather();
    scene.sync(game.state, true);
    assert.equal(scene.featherSpring.bend.length(), 0);
    scene.featherSpring.bend.set(.1, .1);
    scene.bendFeather();
    scene.reduceMotion = true;
    scene.animateFeather(10016);
    assert.equal(scene.featherSpring.bend.length(), 0);
    for (const { geometry, rest } of scene.featherSurfaces) assert.deepEqual(geometry.attributes.position.array, rest);
  }
  assert.ok(Math.max(...peaks) / Math.min(...peaks) < 1.2, 'Амплитуда мало зависит от FPS');
});


test('Журнальный столик на две клетки сохраняет высоту и длинную прямоугольную столешницу', () => {
  const { scene } = setup();
  const single = scene.createObstacle('coffee-table');
  const wide = scene.createObstacle('coffee-table', 2);
  const bounds = new THREE.Box3().setFromObject(wide);
  assert.ok(Math.abs(bounds.getSize(new THREE.Vector3()).x - 1.94) < 1e-6);
  assert.ok(Math.abs(bounds.getSize(new THREE.Vector3()).z - .94) < 1e-6);
  assert.equal(wide.rotation.y, 0);
  assert.equal(wide.scale.y, single.scale.y);
  assert.ok(bounds.max.y < .8);
});


test('Двухклеточные внутренние преграды разрешены только при наличии четырёх пар', () => {
  for (const [count, enabled] of [[6, false], [8, true]]) {
    const walls = Array.from({ length: count }, (_, i) => ({ x: i + 1, y: 1 }));
    const pairs = pairInteriorWalls({ width: count + 2, height: 3, walls });
    assert.equal(pairs.size, enabled ? count : 0);
    for (const [key, partner] of pairs) assert.equal(cellKey(pairs.get(cellKey(partner))), key);
  }
});
