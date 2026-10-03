import * as THREE from 'three';
import { cellKey, directions, perimeterSide } from './game.js';
import { buildPerimeter } from './perimeter.js';
import { sceneConfig } from './config.js';
import { Guidance } from './guidance.js';
import { ModelFactory } from './model-factory.js';
import { obstacleModels } from './model-registry.js';
import { disposeModel } from './model-resources.js';
export { obstacleModels } from './model-registry.js';

// Максимальное число непересекающихся пар соседних внутренних стен.
export function pairInteriorWalls(map) {
  const walls = map.walls.filter((point) => !perimeterSide(map, point));
  const byKey = new Map(walls.map((point) => [cellKey(point), point]));
  const matched = new Map();
  const augment = (point, visited) => {
    for (const delta of Object.values(directions)) {
      const key = cellKey({ x: point.x + delta.x, y: point.y + delta.y });
      if (!byKey.has(key) || visited.has(key)) continue;
      visited.add(key);
      if (!matched.has(key) || augment(matched.get(key), visited)) {
        matched.set(key, point);
        return true;
      }
    }
    return false;
  };
  for (const point of walls) if ((point.x + point.y) % 2 === 0) augment(point, new Set());
  if (matched.size <= 3) return new Map();
  const pairs = new Map();
  for (const [key, point] of matched) {
    pairs.set(key, point);
    pairs.set(cellKey(point), byKey.get(key));
  }
  return pairs;
}

export class RoomScene extends ModelFactory {
  constructor(container) {
    super();
    this.listeners = new AbortController();
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    const gl = this.renderer.getContext();
    this.maxRenderDimension = Math.min(4096, gl.getParameter(gl.MAX_RENDERBUFFER_SIZE), gl.getParameter(gl.MAX_TEXTURE_SIZE));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.domElement.setAttribute('aria-label', 'Трёхмерная комната сокобана');
    this.renderer.domElement.setAttribute('role', 'img');
    container.append(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 1, .1, 100);
    this.verticalAngle = sceneConfig.initialVerticalAngle;
    this.fitCamera();
    this.setupMouseControls(container.ownerDocument);
    this.scene.add(new THREE.HemisphereLight(0xfff0cf, 0x45585a, 2.5));
    const light = new THREE.DirectionalLight(0xffe5b8, 3.5);
    light.position.set(-4, 11, 3);
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    Object.assign(light.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: .5, far: 30 });
    light.shadow.bias = -.0005;
    light.shadow.normalBias = .035;
    this.scene.add(light);
    this.animation = null;
    this.reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.renderer.setAnimationLoop((time) => this.frame(time));
    this.renderer.domElement.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      this.renderer.setAnimationLoop(null);
      container.dispatchEvent(new CustomEvent('rendererror', { detail: '3D-сцена временно недоступна. Если она не восстановится, закройте вкладку и откройте игру заново.' }));
    }, { signal: this.listeners.signal });
    this.renderer.domElement.addEventListener('webglcontextrestored', () => {
      this.resize();
      this.renderer.setAnimationLoop((time) => this.frame(time));
      container.dispatchEvent(new CustomEvent('renderrestored'));
    }, { signal: this.listeners.signal });
  }

  position(point, height = 0) {
    return new THREE.Vector3(point.x - (this.map.width - 1) / 2, height, point.y - (this.map.height - 1) / 2);
  }

  animateChest(chest, time) {
    const data = chest.userData.chest;
    const transition = data.transition;
    if (transition) {
      const amount = THREE.MathUtils.clamp((time - transition.start) / transition.duration, 0, 1);
      // Обратный ход ускоряется к концу, чтобы крышка именно захлопывалась.
      const ease = transition.to ? amount * amount * (3 - 2 * amount) : amount * amount;
      data.progress = amount === 1 ? transition.to : THREE.MathUtils.lerp(transition.from, transition.to, ease);
      if (amount === 1) data.transition = null;
    }
    const stone = data.stoneTransition;
    if (stone) {
      const amount = THREE.MathUtils.clamp((time - stone.start) / stone.duration, 0, 1);
      data.stoneProgress = THREE.MathUtils.lerp(stone.from, stone.to, amount * amount * (3 - 2 * amount));
      if (amount === 1) data.stoneTransition = null;
    }
    const moss = data.mossTransition;
    if (moss) {
      const amount = THREE.MathUtils.clamp((time - moss.start) / moss.duration, 0, 1);
      data.mossProgress = THREE.MathUtils.lerp(moss.from, moss.to, amount * amount * (3 - 2 * amount));
      if (amount === 1) data.mossTransition = null;
    }
    if (transition || stone || moss) this.setChestProgress(chest, data.progress);
  }

  clearRoom() {
    if (!this.room) return;
    disposeModel(this.room);
    this.room.clear();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelControls?.();
    this.listeners?.abort();
    this.observer?.disconnect();
    this.renderer?.setAnimationLoop(null);
    this.clearRoom();
    if (this.scene) {
      this.scene.traverse((object) => object.shadow?.dispose());
      disposeModel(this.scene);
      this.scene.clear();
    }
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
    this.onMove = this.onIdle = this.onVictory = null;
  }

  load(map, state, { tutorial = false } = {}) {
    this.clearRoom();
    this.map = map;
    this.guidance = new Guidance(map);
    this.tutorial = tutorial;
    this.hint = null;
    this.hintAttention = null;
    this.hintState = null;
    this.animation = null;
    this.action = null;
    this.room = new THREE.Group();
    this.scene.add(this.room);
    const floorMaterials = [this.material(0x655948), this.material(0x72624d)];
    const edge = this.material(0x283533);
    // Основание повторяет контур комнаты, не закрывая пустоты .sok.
    if (!map.exterior.size) {
      this.block(this.room, [map.width + .3, .28, map.height + .3], [0, -.28, 0], edge);
    } else {
      for (const key of [...map.floor, ...map.walls.map(cellKey)]) {
        const [x, y] = key.split(',').map(Number);
        const base = this.block(this.room, [1, .28, 1], this.position({ x, y }, -.28).toArray(), edge);
        base.userData.baseCell = { x, y };
      }
    }
    for (const key of map.floor) {
      const [x, y] = key.split(',').map(Number);
      const point = this.position({ x, y }, -.05);
      this.block(this.room, [.96, .14, .96], point.toArray(), floorMaterials[(x + y) % 2], false);
    }
    this.obstacles = [];
    const furnitureCells = new Set();
    const occupied = new Set();
    const pairs = pairInteriorWalls(map);
    const isFurniture = (variant) => variant === 'coffee-table' || variant === 'cabinet';
    let obstacleVariants = [];
    for (const point of map.walls) {
      const perimeter = perimeterSide(map, point);
      if (!perimeter) {
        if (occupied.has(cellKey(point))) continue;
        // Перемешанный набор даёт разнообразие даже в небольших комнатах.
        if (!obstacleVariants.length) {
          obstacleVariants = obstacleModels.map(({ id }) => id);
          for (let i = obstacleVariants.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [obstacleVariants[i], obstacleVariants[j]] = [obstacleVariants[j], obstacleVariants[i]];
          }
        }
        const partner = pairs.get(cellKey(point));
        const pairAvailable = partner && !occupied.has(cellKey(partner));
        const cellsFor = (variant) => pairAvailable && obstacleModels.find((model) => model.id === variant).maxSpan === 2
          ? [point, partner] : [point];
        // Проверяем соседство у каждой клетки многоклеточной мебели.
        const besideFurniture = (cells) => cells.some((cell) => Object.values(directions).some((delta) =>
          furnitureCells.has(cellKey({ x: cell.x + delta.x, y: cell.y + delta.y }))));
        const variantIndex = obstacleVariants.findLastIndex((variant) =>
          !isFurniture(variant) || !besideFurniture(cellsFor(variant)));
        const variant = variantIndex >= 0
          ? obstacleVariants.splice(variantIndex, 1)[0]
          : ['stack', 'upright', 'pyramid'][Math.floor(Math.random() * 3)];
        const cells = cellsFor(variant);
        for (const cell of cells) {
          occupied.add(cellKey(cell));
          if (isFurniture(variant)) furnitureCells.add(cellKey(cell));
          const position = this.position(cell, -.05);
          this.block(this.room, [.96, .14, .96], position.toArray(), floorMaterials[(cell.x + cell.y) % 2], false);
        }
        const obstacle = this.createObstacle(variant, cells.length);
        obstacle.userData.cells = cells;
        const last = cells.at(-1);
        obstacle.position.copy(this.position({ x: (point.x + last.x) / 2, y: (point.y + last.y) / 2 }, .02));
        if (cells.length > 1) {
          obstacle.rotation.y = (point.x === last.x ? Math.PI / 2 : 0) + (Math.random() < .5 ? 0 : Math.PI);
        }
        this.room.add(obstacle);
        this.obstacles.push(obstacle);
        continue;
      }
      const position = this.position(point, -.05);
      this.block(this.room, [.96, .14, .96], position.toArray(), floorMaterials[(point.x + point.y) % 2], false);
    }
    this.perimeter = buildPerimeter(this, map);
    this.goalMeshes = map.goals.map((point) => {
      const seal = this.createGoalSeal();
      seal.position.copy(this.position(point, .027));
      this.room.add(seal);
      return seal;
    });
    this.boxes = state.boxes.map((point) => {
      const group = this.createMovableChest();
      group.position.copy(this.position(point, group.userData.groundOffset));
      this.room.add(group);
      return group;
    });
    this.createHintArrow();
    this.createPlayer();
    this.player.position.copy(this.position(state.player, this.player.userData.groundOffset));
    this.room.add(this.player);
    this.poseNodes = [this.rig, this.headPivot, this.hatPivot, ...this.arms, ...this.legs];
    this.previousPose = this.poseNodes.map((node) => ({
      position: node.position.clone(), rotation: node.rotation.clone(), scale: node.scale.clone(),
    }));
    this.facing = 0;
    this.lastPoseTime = null;
    this.idleGesture = 0;
    this.lastGestureTime = -Infinity;
    this.lastShakeTime = -Infinity;
    this.walkSide = 1;
    this.sync(state, true);
    this.roomBounds = new THREE.Box3().setFromObject(this.room);
    this.roomHeight = Math.max(1.65, this.roomBounds.max.y + .15);
    // Кадрируем отдельные предметы: общий параллелепипед добавляет
    // пустые верхние углы и отдаляет камеру, особенно на телефоне.
    this.cameraFitPoints = [];
    const addBounds = (bounds) => {
      if (bounds.isEmpty()) return;
      for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
        this.cameraFitPoints.push(new THREE.Vector3(x, y, z));
      }
    };
    for (const object of this.room.children) addBounds(new THREE.Box3().setFromObject(object));
    // Герой и открытый сундук должны помещаться в любой игровой клетке,
    // чтобы после хода камера оставалась неподвижной.
    for (const key of map.floor) {
      const [x, y] = key.split(',').map(Number);
      const center = this.position({ x, y });
      addBounds(new THREE.Box3(
        new THREE.Vector3(center.x - .5, 0, center.z - .5),
        new THREE.Vector3(center.x + .5, 1.65, center.z + .5),
      ));
    }
    this.resize();
  }

  createHintArrow() {
    this.hintArrow = new THREE.Group();
    this.hintArrow.name = 'tutorial-arrow';
    const ink = new THREE.MeshBasicMaterial({ color: 0xe8bb4b, depthWrite: true,
      side: THREE.DoubleSide, toneMapped: false });
    this.hintFlowTime = { value: 0 };
    this.hintFlowStrength = { value: 1 };
    this.hintRouteLength = { value: 1 };
    ink.onBeforeCompile = (shader) => {
      shader.uniforms.hintFlowTime = this.hintFlowTime;
      shader.uniforms.hintFlowStrength = this.hintFlowStrength;
      shader.uniforms.hintRouteLength = this.hintRouteLength;
      shader.uniforms.hintGlintColor = { value: new THREE.Color(0xffd477) };
      shader.uniforms.hintSunColor = { value: new THREE.Color(0xfff3b8) };
      shader.vertexShader = `attribute float routeDistance;\nvarying float vRouteDistance;\n${shader.vertexShader}`
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRouteDistance = routeDistance;');
      shader.fragmentShader = `uniform float hintFlowTime;\nuniform float hintFlowStrength;\nuniform float hintRouteLength;\nuniform vec3 hintGlintColor;\nuniform vec3 hintSunColor;\nvarying float vRouteDistance;\n${shader.fragmentShader}`
        .replace('#include <color_fragment>', `#include <color_fragment>
          float softDuration = (hintRouteLength + .7) / .9;
          float cycleDuration = softDuration + .55;
          float cycleAge = mod(hintFlowTime, cycleDuration);
          float center = cycleAge * .9 - .35;
          float sunnyPass = step(softDuration, cycleAge);
          float distanceToGlint = abs(vRouteDistance - center);
          float softGlint = 1.0 - smoothstep(.04, .30, distanceToGlint);
          float flashAge = max(0.0, cycleAge - softDuration);
          float seed = floor(hintFlowTime / cycleDuration);
          float spot = fract(sin(seed * 12.9898 + 7.23) * 43758.5453);
          float sunCenter = spot * hintRouteLength + (flashAge - .15) * 2.7;
          float sunDistance = abs(vRouteDistance - sunCenter);
          float flashFade = smoothstep(0.0, .045, flashAge) * (1.0 - smoothstep(.12, .32, flashAge));
          float sunHalo = (1.0 - smoothstep(.02, .16, sunDistance)) * flashFade;
          float sunCore = (1.0 - smoothstep(.008, .065, sunDistance)) * flashFade;
          vec3 softColor = mix(diffuseColor.rgb, hintGlintColor, softGlint);
          vec3 sunColor = mix(diffuseColor.rgb, hintGlintColor, sunHalo * .65);
          sunColor = mix(sunColor, hintSunColor, sunCore);
          diffuseColor.rgb = mix(diffuseColor.rgb, mix(softColor, sunColor, sunnyPass), hintFlowStrength);`);
    };
    this.hintShaft = new THREE.Mesh(new THREE.BufferGeometry(), ink);
    this.hintArrow.add(this.hintShaft);
    const edgeInk = new THREE.MeshBasicMaterial({ color: 0x8c6226, depthWrite: true,
      side: THREE.DoubleSide, toneMapped: false });
    this.hintShaftEdge = new THREE.Mesh(new THREE.BufferGeometry(), edgeInk);
    this.hintArrow.add(this.hintShaftEdge);
    const shape = new THREE.Shape();
    shape.moveTo(-.22, .26);
    shape.lineTo(0, -.08);
    shape.lineTo(.22, .26);
    shape.closePath();
    // Наконечник всегда однотонный, чтобы направление читалось в любой фазе блика.
    const headInk = new THREE.MeshBasicMaterial({ color: 0xe8bb4b, depthWrite: true,
      side: THREE.DoubleSide, toneMapped: false });
    this.hintHead = new THREE.Mesh(new THREE.ShapeGeometry(shape), headInk);
    this.hintHead.rotation.x = -Math.PI / 2;
    this.hintTip = new THREE.Group();
    this.hintTip.add(this.hintHead);
    const headEdgeGeometry = new THREE.ExtrudeGeometry(shape, { depth: .0175, bevelEnabled: false });
    const sideGroup = headEdgeGeometry.groups[1];
    headEdgeGeometry.setDrawRange(sideGroup.start, sideGroup.count);
    headEdgeGeometry.clearGroups();
    this.hintHeadEdge = new THREE.Mesh(headEdgeGeometry, edgeInk);
    this.hintHeadEdge.rotation.x = -Math.PI / 2;
    this.hintHeadEdge.position.y = -.0175;
    this.hintTip.add(this.hintHeadEdge);
    this.hintArrow.add(this.hintTip);
    this.hintArrow.visible = false;
    this.room.add(this.hintArrow);
    this.createHintGhost();
  }

  createHintGhost() {
    this.hintGhost = new THREE.Group();
    this.hintGhost.name = 'tutorial-chest-ghost';
    this.hintGhostTime = { value: 0 };
    const materials = new Map();
    // Прозрачные поверхности внешних деталей модели без каркаса и обводки.
    // Внутренняя обшивка и книги не нужны закрытому призрачному сундуку.
    const chest = this.boxes[0];
    chest.updateWorldMatrix(true, true);
    const inverse = chest.matrixWorld.clone().invert();
    this.hintGhost.scale.copy(chest.scale);
    chest.traverseVisible((mesh) => {
      if (!mesh.isMesh || mesh.material === chest.userData.chest.materials[4]) return;
      const geometry = mesh.geometry.clone();
      geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld));
      if (!materials.has(mesh.material)) {
        const ink = new THREE.MeshBasicMaterial({ color: 0xffffff,
          transparent: true, opacity: .22, depthWrite: false, toneMapped: false });
        // Координаты всех деталей уже приведены к одной системе сундука:
        // полоса прозрачности проходит непрерывно через корпус, крышку и металл.
        ink.onBeforeCompile = (shader) => {
          shader.uniforms.ghostTime = this.hintGhostTime;
          shader.vertexShader = `varying vec3 vGhostPosition;\n${shader.vertexShader}`
            .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGhostPosition = position;');
          shader.fragmentShader = `uniform float ghostTime;\nvarying vec3 vGhostPosition;\n${shader.fragmentShader}`
            .replace('#include <color_fragment>', `#include <color_fragment>
              float sweep = fract(vGhostPosition.y * .8 + vGhostPosition.x * .35 - ghostTime * .32);
              float clearBand = smoothstep(.18, .44, sweep) * (1.0 - smoothstep(.44, .70, sweep));
              diffuseColor.a *= 1.0 - clearBand * .5;`);
        };
        materials.set(mesh.material, ink);
      }
      const surface = new THREE.Mesh(geometry, materials.get(mesh.material));
      surface.name = mesh.name;
      this.hintGhost.add(surface);
    });
    this.hintGhostMaterials = [...materials.values()];
    this.hintGhost.visible = false;
    this.room.add(this.hintGhost);
  }

  updateHintGhost(time) {
    const hint = this.hint;
    this.hintGhost.visible = Boolean(hint) && cellKey(hint.from) !== cellKey(hint.to);
    if (!this.hintGhost.visible) return;
    this.hintGhost.position.copy(this.position(hint.to, this.boxes[hint.boxIndex].userData.groundOffset));
    // Не оставляем второй контур на уже прибывшем сундуке во время анимации.
    if (this.boxes.some((box) => Math.hypot(box.position.x - this.hintGhost.position.x,
      box.position.z - this.hintGhost.position.z) < .12)) this.hintGhost.visible = false;
    this.hintGhostTime.value = this.reduceMotion ? 0 : time * .001;
  }

  updateHintArrow(time = performance.now()) {
    const hint = this.hint;
    this.updateHintGhost(time);
    this.hintArrow.visible = Boolean(hint);
    if (!hint) return;
    this.hintFlowTime.value = this.reduceMotion ? 0 : time * .001;
    this.hintFlowStrength.value = this.reduceMotion ? 0 : 1;
    const origin = this.boxes[hint.boxIndex].position.clone();
    origin.y = .075;
    this.hintArrow.position.copy(origin);
    // Рисуем маршрут с поворотами до ключевой позиции, чтобы стрелка
    // не пересекала стены при смене направления толчка.
    const path = hint.path ?? [hint.from, hint.to];
    const corners = [origin];
    for (let i = 1; i < path.length - 1; i++) {
      const previous = path[i - 1];
      const point = path[i];
      const next = path[i + 1];
      if (point.x - previous.x !== next.x - point.x || point.y - previous.y !== next.y - point.y) {
        corners.push(this.position(point, .075));
      }
    }
    corners.push(this.position(hint.to, .075));
    // При прибытии в поворот первый участок может иметь нулевую длину.
    const points = corners.filter((point, index) => index === 0 || point.distanceTo(corners[index - 1]) > .0001);
    if (points.length < 2) { this.hintArrow.visible = false; return; }
    const firstDirection = points[1].clone().sub(points[0]).normalize();
    const lastDirection = points.at(-1).clone().sub(points.at(-2)).normalize();
    this.hintTip.position.copy(points.at(-1)).sub(origin).addScaledVector(lastDirection, -.08);
    this.hintTip.rotation.y = Math.atan2(lastDirection.x, lastDirection.z);
    this.hintArrow.visible = points.length > 2 || points[1].distanceTo(origin) > .55;
    points[0] = points[0].clone().addScaledVector(firstDirection, Math.min(.38, points[0].distanceTo(points[1]) * .45));
    points[points.length - 1] = points.at(-1).clone().addScaledVector(lastDirection,
      -Math.min(.22, points.at(-1).distanceTo(points.at(-2)) * .45));
    this.updateHintRibbon(points, origin);
  }

  updateHintRibbon(points, origin) {
    const geometry = this.hintShaft.geometry;
    const count = points.length * 2;
    if (geometry.attributes.position?.count !== count) {
      // Старый GPU-буфер освобождается при изменении числа поворотов.
      geometry.dispose();
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
      geometry.setAttribute('routeDistance', new THREE.BufferAttribute(new Float32Array(count), 1).setUsage(THREE.DynamicDrawUsage));
      const indices = [];
      for (let i = 0; i < points.length - 1; i++) {
        const vertex = i * 2;
        indices.push(vertex, vertex + 1, vertex + 2, vertex + 1, vertex + 3, vertex + 2);
      }
      geometry.setIndex(indices);
    }
    const normals = points.slice(1).map((point, index) => {
      const direction = point.clone().sub(points[index]).normalize();
      return new THREE.Vector3(-direction.z, 0, direction.x);
    });
    const halfWidth = .085 / 2;
    let distance = 0;
    points.forEach((point, index) => {
      if (index > 0) distance += point.distanceTo(points[index - 1]);
      geometry.attributes.routeDistance.setX(index * 2, distance);
      geometry.attributes.routeDistance.setX(index * 2 + 1, distance);
      const before = normals[Math.max(0, index - 1)];
      const after = normals[Math.min(index, normals.length - 1)];
      const miter = before.clone().add(after);
      if (miter.lengthSq() < .000001) miter.copy(after);
      miter.normalize();
      // Общая пара вершин соединяет оба участка без щели и нахлёста.
      // Ограничение защищает от длинных выступов при почти полном развороте.
      miter.multiplyScalar(Math.min(halfWidth * 4, halfWidth / Math.max(.0001, miter.dot(after))));
      const center = point.clone().sub(origin);
      geometry.attributes.position.setXYZ(index * 2, center.x + miter.x, 0, center.z + miter.z);
      geometry.attributes.position.setXYZ(index * 2 + 1, center.x - miter.x, 0, center.z - miter.z);
    });
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.routeDistance.needsUpdate = true;
    this.hintRouteLength.value = distance;
    geometry.computeBoundingSphere();
    const edgeGeometry = this.hintShaftEdge.geometry;
    // Замкнутый тёмный борт под жёлтой лентой, включая оба торца.
    const boundary = [];
    for (let i = 0; i < count; i += 2) boundary.push(i);
    for (let i = count - 1; i >= 1; i -= 2) boundary.push(i);
    if (edgeGeometry.attributes.position?.count !== count * 6) {
      edgeGeometry.dispose();
      edgeGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 18), 3)
        .setUsage(THREE.DynamicDrawUsage));
    }
    const edgePositions = edgeGeometry.attributes.position;
    boundary.forEach((vertex, index) => {
      const next = boundary[(index + 1) % count];
      const top = geometry.attributes.position;
      const a = [top.getX(vertex), 0, top.getZ(vertex)];
      const b = [top.getX(next), 0, top.getZ(next)];
      const bottomA = [a[0], -.0175, a[2]];
      const bottomB = [b[0], -.0175, b[2]];
      [a, bottomA, b, b, bottomA, bottomB].forEach((point, offset) =>
        edgePositions.setXYZ(index * 6 + offset, ...point));
    });
    edgePositions.needsUpdate = true;
    edgeGeometry.computeBoundingSphere();
  }

  resetFeatherPhysics() {
    const spring = this.featherSpring;
    if (!spring) return;
    spring.bend.set(0, 0);
    spring.velocity.set(0, 0);
    spring.previousVelocity.set(0, 0, 0);
    spring.time = null;
    this.bendFeather();
  }

  bendFeather() {
    const { bend, applied } = this.featherSpring;
    if (bend.distanceToSquared(applied) < 1e-12) return;
    const shortening = bend.lengthSq() * .2;
    for (const { geometry, rest } of this.featherSurfaces) {
      const positions = geometry.attributes.position;
      for (let index = 0; index < positions.count; index++) {
        const offset = index * 3;
        const height = Math.max(0, rest[offset + 1] - .075);
        const flex = height * height / .475;
        positions.setXYZ(index, rest[offset] + bend.x * flex,
          rest[offset + 1] - flex * shortening, rest[offset + 2] + bend.y * flex);
      }
      positions.needsUpdate = true;
      geometry.computeVertexNormals();
      // Запас для изгиба исключает обрезание пера при отсечении объектов камерой.
      geometry.computeBoundingSphere();
      geometry.boundingSphere.radius += .15;
    }
    applied.copy(bend);
  }

  animateFeather(time) {
    const spring = this.featherSpring;
    if (!spring) return;
    if (this.reduceMotion) { this.resetFeatherPhysics(); return; }
    // Ускорение кончика в неподвижной форме учитывает и шаги, и вращение головы.
    spring.tip.set(.09, .55, 0);
    this.feather.localToWorld(spring.tip);
    const dt = spring.time === null ? 0 : (time - spring.time) / 1000;
    if (dt <= 0 || dt > .1) {
      this.resetFeatherPhysics();
      spring.previousTip.copy(spring.tip);
      spring.time = time;
      return;
    }
    spring.motion.copy(spring.tip).sub(spring.previousTip).divideScalar(dt);
    spring.acceleration.copy(spring.motion).sub(spring.previousVelocity).divideScalar(dt);
    this.feather.getWorldQuaternion(spring.rotation).invert();
    spring.acceleration.applyQuaternion(spring.rotation).clampLength(0, 40);
    spring.previousTip.copy(spring.tip);
    spring.previousVelocity.copy(spring.motion);
    spring.time = time;
    // Затухающая пружина; короткие подшаги сохраняют устойчивость при разной частоте кадров.
    const steps = Math.ceil(dt / (1 / 120));
    const step = dt / steps;
    for (let index = 0; index < steps; index++) {
      spring.velocity.x += (-90 * spring.bend.x - 8 * spring.velocity.x - .29 * spring.acceleration.x) * step;
      spring.velocity.y += (-90 * spring.bend.y - 8 * spring.velocity.y - .29 * spring.acceleration.z) * step;
      spring.velocity.clampLength(0, 1.8);
      spring.bend.addScaledVector(spring.velocity, step);
      if (spring.bend.length() > .28) {
        spring.bend.clampLength(0, .28);
        spring.velocity.multiplyScalar(.5);
      }
    }
    this.bendFeather();
  }

  sync(state, immediate = false, { action = 'walk', direction, complete = false, placedOnGoal = false } = {}) {
    this.victoryReady = complete && (immediate || this.reduceMotion);
    if (action === 'push' && !immediate) this.touchHintChest(direction);
    this.action = null;
    if (immediate) {
      this.facingHistory = [];
    } else if (action === 'undo') {
      const previousFacing = this.facingHistory.pop();
      if (previousFacing !== undefined) {
        this.facing = previousFacing;
        if (this.reduceMotion) this.player.rotation.y = this.facing;
      }
    } else if (action === 'walk' || action === 'push') {
      this.facingHistory.push(this.facing);
    }
    if (direction && action !== 'undo') this.face(direction);
    this.followup = null;
    const now = performance.now();
    this.lastMoveTime = now;
    this.nextIdleAt = now + 16000 + Math.random() * 10000;
    this.pushCount = immediate ? 0 : action === 'push' ? (this.pushCount ?? 0) + 1 : 0;
    this.pendingRub = this.pushCount >= 3;
    const objects = [this.player, ...this.boxes];
    const points = [state.player, ...state.boxes];
    const from = objects.map((object) => object.position.clone());
    const to = points.map((point, index) => this.position(point, objects[index].userData.groundOffset));
    if (immediate || this.reduceMotion) {
      objects.forEach((object, index) => object.position.copy(to[index]));
      this.animation = null;
      this.resetPose();
      this.resetFeatherPhysics();
    } else {
      const start = performance.now();
      const duration = action === 'push' ? 260 : action === 'undo' ? 320 : 180;
      // Руки сначала упираются в ящик, затем он движется; отпускание не блокирует следующий ход.
      this.animation = { objects, from, to, start: start + (action === 'push' ? 110 : 0), duration };
      if (action === 'walk' || action === 'push') this.walkSide *= -1;
      this.action = { type: action, start, duration: action === 'push' ? 650 : action === 'walk' ? 300 : duration,
        initialEffort: Math.max(0, this.rig.rotation.x / .24) };
      this.followup = complete ? 'victory' : placedOnGoal ? 'nod' : null;
    }
    const goals = new Set(this.map.goals.map(cellKey));
    const stoneBoxes = this.guidance.stoneBoxes(state);
    const frozenBoxes = this.guidance.frozenBoxes(state);
    this.hint = this.tutorial ? this.guidance.hint(state) : null;
    const hintKey = this.hint ? `${this.hint.boxIndex}:${cellKey(this.hint.to)}` : null;
    if (!hintKey) this.hintAttention = null;
    else if (hintKey !== this.hintAttention?.key || (immediate && state.moves === 0)) {
      this.hintAttention = { key: hintKey, touched: false, start: now };
    }
    this.hintState = state;
    this.updateHintArrow();
    state.boxes.forEach((box, index) => {
      const chest = this.boxes[index];
      const data = chest.userData.chest;
      const target = goals.has(cellKey(box)) ? 1 : 0;
      const stoneTarget = stoneBoxes[index] ? 1 : 0;
      const mossTarget = stoneTarget && frozenBoxes[index] ? 1 : 0;
      this.animateChest(chest, now);
      if (immediate || this.reduceMotion) {
        data.mossProgress = mossTarget;
        data.mossTarget = mossTarget;
        data.mossTransition = null;
      } else if (mossTarget !== data.mossTarget) {
        data.mossTarget = mossTarget;
        data.mossTransition = { from: data.mossProgress, to: mossTarget,
          start: this.animation.start + this.animation.duration + (mossTarget ? 450 : 0), duration: mossTarget ? 1200 : 850 };
      }
      if (immediate || this.reduceMotion) {
        data.stoneProgress = stoneTarget;
        data.stoneTarget = stoneTarget;
        data.stoneTransition = null;
      } else if (stoneTarget !== data.stoneTarget) {
        data.stoneTarget = stoneTarget;
        data.stoneTransition = { from: data.stoneProgress, to: stoneTarget,
          start: this.animation.start + this.animation.duration, duration: 850 };
      }
      if (immediate || this.reduceMotion) {
        data.target = target;
        data.transition = null;
        this.setChestProgress(chest, target);
      } else if (target !== data.target) {
        // До прибытия сундук закрыт; уход с печати сразу разворачивает анимацию.
        this.animateChest(chest, now);
        data.target = target;
        data.transition = { from: data.progress, to: target,
          start: target ? this.animation.start + this.animation.duration : now,
          duration: target ? 900 : 300 };
      }
    });
    this.goalMeshes.forEach((seal, index) => {
      const occupied = state.boxes.some((box) => cellKey(box) === cellKey(this.map.goals[index]));
      seal.userData.occupied = occupied;
      seal.userData.ink.emissiveIntensity = occupied ? 1.6 : 1.05;
    });
  }


  face(direction) {
    const delta = directions[direction];
    if (delta) {
      this.facing = Math.atan2(delta.x, delta.y);
      if (this.reduceMotion) this.player.rotation.y = this.facing;
    }
  }

  get busy() {
    return Boolean(this.animation || this.action?.type === 'blocked');
  }

  blockedPush(direction, pushing = true) {
    if (pushing) this.touchHintChest(direction);
    this.face(direction);
    const now = performance.now();
    // Удержание клавиши не запускает покачивание головы заново на каждом повторе.
    if (now - this.lastShakeTime < 1200) return;
    this.lastShakeTime = now;
    this.followup = null;
    this.pendingRub = false;
    this.lastMoveTime = performance.now();
    this.nextIdleAt = this.lastMoveTime + 16000 + Math.random() * 10000;
    if (!this.reduceMotion) {
      this.action = { type: pushing ? 'blocked' : 'shake', start: now, duration: pushing ? 420 : 700,
        axis: Math.random() < .5 ? 'y' : 'z' };
      this.followup = pushing ? 'shake' : null;
    }
  }

  touchHintChest(direction) {
    const delta = directions[direction];
    if (!delta || !this.hint || !this.hintState || !this.hintAttention) return;
    const target = { x: this.hintState.player.x + delta.x, y: this.hintState.player.y + delta.y };
    if (cellKey(target) !== cellKey(this.hintState.boxes[this.hint.boxIndex])) return;
    this.hintAttention.touched = true;
    this.hintShaft.visible = this.hintHead.visible = true;
  }

  resetPose() {
    if (!this.rig) return;
    this.rig.position.set(0, 0, 0);
    this.rig.rotation.set(0, 0, 0);
    this.rig.scale.set(1, 1, 1);
    this.headPivot.rotation.set(0, 0, 0);
    this.hatPivot.rotation.set(0, 0, 0);
    [...this.arms, ...this.legs].forEach((limb) => limb.rotation.set(0, 0, 0));
  }

  animatePlayer(time) {
    if (!this.rig) return;
    if (this.reduceMotion) { this.resetPose(); return; }
    const dt = this.lastPoseTime === null ? 1 / 60 : Math.min(.05, Math.max(0, (time - this.lastPoseTime) / 1000));
    this.lastPoseTime = time;
    const blend = 1 - Math.exp(-18 * dt);
    const turn = Math.atan2(Math.sin(this.facing - this.player.rotation.y), Math.cos(this.facing - this.player.rotation.y));
    this.player.rotation.y += turn * blend;
    this.poseNodes.forEach((node, index) => {
      const pose = this.previousPose[index];
      pose.position.copy(node.position);
      pose.rotation.copy(node.rotation);
      pose.scale.copy(node.scale);
    });
    this.resetPose();
    if (!this.action && !this.animation) {
      if (this.pendingRub && time - this.lastMoveTime > 900 && time - this.lastGestureTime > 20000) {
        this.action = { type: 'rub', start: time, duration: 1100 };
        this.pendingRub = false;
        this.lastGestureTime = time;
        this.nextIdleAt = time + 20000 + Math.random() * 10000;
      } else if (time >= this.nextIdleAt) {
        this.action = { type: this.idleGesture++ % 2 === 0 ? 'hat' : 'look', start: time, duration: 1800 };
        this.lastGestureTime = time;
        this.nextIdleAt = time + 20000 + Math.random() * 10000;
      }
    }
    this.setPose(time);
    // Поза меняется непрерывно даже при прерывании жеста новым ходом.
    this.poseNodes.forEach((node, index) => {
      const pose = this.previousPose[index];
      node.position.lerpVectors(pose.position, node.position, blend);
      node.scale.lerpVectors(pose.scale, node.scale, blend);
      for (const axis of ['x', 'y', 'z']) node.rotation[axis] = THREE.MathUtils.lerp(pose.rotation[axis], node.rotation[axis], blend);
    });
  }

  setPose(time) {
    const action = this.action;
    if (!action) {
      const breath = Math.sin(time / 1100);
      this.rig.scale.y = 1 + breath * .006;
      this.rig.rotation.z = Math.sin(time / 1800) * .005;
      this.arms.forEach((arm, index) => { arm.rotation.x = Math.sin(time / 1500 + index * .6) * .012; });
      return;
    }
    const progress = THREE.MathUtils.clamp((time - action.start) / action.duration, 0, 1);
    const ease = (value) => {
      const t = THREE.MathUtils.clamp(value, 0, 1);
      return t * t * t * (t * (t * 6 - 15) + 10);
    };
    const effort = Math.sin(progress * Math.PI) ** 2;
    if (action.type === 'push' || action.type === 'blocked') {
      const elapsed = time - action.start;
      const pressure = action.type === 'push'
        ? THREE.MathUtils.lerp(action.initialEffort, 1, ease(elapsed / 110)) * (1 - ease((elapsed - 370) / 280))
        : effort;
      this.rig.rotation.x = .24 * pressure;
      this.arms.forEach((arm) => { arm.rotation.x = -1.25 * pressure; });
      this.legs[0].rotation.x = .3 * pressure;
      this.legs[1].rotation.x = -.25 * pressure;
      if (action.type === 'push') {
        const movement = THREE.MathUtils.clamp((elapsed - 110) / 260, 0, 1);
        const step = Math.sin(movement * Math.PI) * .4 * this.walkSide;
        this.legs[0].rotation.x = .12 * pressure + step;
        this.legs[1].rotation.x = -.1 * pressure - step;
      }
      if (action.type === 'blocked') {
        this.rig.position.z = .075 * effort;
        this.rig.rotation.z = Math.sin(progress * Math.PI * 8) * .035 * effort;
      }
    } else if (action.type === 'hat') {
      this.arms[1].rotation.x = -2.65 * effort;
      this.arms[1].rotation.z = .38 * effort;
      this.hatPivot.rotation.x = -.3 * effort;
      this.headPivot.rotation.z = -.045 * effort;
    } else if (action.type === 'look') {
      this.headPivot.rotation.y = Math.sin(progress * Math.PI * 2) * .3 * effort;
    } else if (action.type === 'nod') {
      this.headPivot.rotation.x = .18 * effort;
    } else if (action.type === 'shake') {
      const axis = action.axis ?? 'y';
      this.headPivot.rotation[axis] = Math.sin(progress * Math.PI * 4) * (axis === 'z' ? .25 : .32) * effort;
    } else if (action.type === 'rub') {
      this.arms.forEach((arm, index) => {
        arm.rotation.x = -.85 * effort;
        arm.rotation.z = (index === 0 ? .65 : -.65) * effort;
        arm.rotation.y = Math.sin(progress * Math.PI * 4 + index * Math.PI) * .08 * effort;
      });
    } else if (action.type === 'undo') {
      this.rig.rotation.x = -.16 * effort;
      this.rig.rotation.z = Math.sin(progress * Math.PI * 2) * .08;
      this.legs.forEach((leg, index) => { leg.rotation.x = Math.sin(progress * Math.PI * 2 + index * Math.PI) * .35; });
      this.arms.forEach((arm) => { arm.rotation.x = .4 * effort; });
    } else if (action.type === 'victory') {
      const bounce = Math.abs(Math.sin(progress * Math.PI * 3));
      this.rig.position.y = bounce * .16;
      this.rig.rotation.z = Math.sin(progress * Math.PI * 6) * .08 * effort;
      this.arms[0].rotation.z = -2.5 * effort;
      this.arms[1].rotation.z = 2.5 * effort;
    } else {
      this.rig.position.y = effort * .025;
      const stride = Math.sin(progress * Math.PI) * .28 * this.walkSide;
      this.legs[0].rotation.x = stride;
      this.legs[1].rotation.x = -stride;
      this.arms.forEach((arm, index) => { arm.rotation.x = -Math.sin(progress * Math.PI * 2 + index * Math.PI) * .25; });
    }
    if (progress === 1) {
      this.action = this.followup ? { type: this.followup, start: time,
        duration: this.followup === 'victory' ? 1600 : this.followup === 'shake' ? 700 : 650,
        axis: action.axis } : null;
      this.followup = null;
      if (this.action?.type === 'victory') this.pendingRub = false;
      if (action.type === 'victory') {
        this.victoryReady = true;
        this.onVictory?.();
      }
    }
  }

  swipeDirection(dx, dy) {
    this.camera.updateMatrixWorld(true);
    // Перспектива зависит от положения героя; сравниваем направления рядом с ним.
    const origin = new THREE.Vector3(this.player?.position.x ?? 0, 0, this.player?.position.z ?? 0);
    const projectedOrigin = origin.clone().project(this.camera);
    const width = this.container?.clientWidth || this.camera.aspect;
    const height = this.container?.clientHeight || 1;
    let bestDirection;
    let bestScore = -Infinity;
    for (const [name, delta] of Object.entries(directions)) {
      const point = origin.clone().add(new THREE.Vector3(delta.x, 0, delta.y)).project(this.camera);
      const screenDirection = new THREE.Vector2(
        (point.x - projectedOrigin.x) * width,
        -(point.y - projectedOrigin.y) * height,
      ).normalize();
      const score = screenDirection.x * dx + screenDirection.y * dy;
      if (score > bestScore) {
        bestScore = score;
        bestDirection = name;
      }
    }
    return bestDirection;
  }

  setupMouseControls(surface = this.renderer.domElement) {
    const canvas = this.renderer.domElement;
    const pointers = new Map();
    const captureTargets = new Map();
    const suppressedClicks = new Map();
    let gesture = null;
    this.controlsEnabled = true;
    const release = (id) => {
      const target = captureTargets.get(id);
      captureTargets.delete(id);
      if (target?.hasPointerCapture(id)) target.releasePointerCapture(id);
    };
    this.cancelControls = () => {
      const ids = [...pointers.keys()];
      pointers.clear();
      gesture = null;
      canvas.classList.remove('is-dragging');
      ids.forEach(release);
    };
    const midpoint = () => [...pointers.values()].reduce((sum, point) => sum + point.y, 0) / pointers.size;
    const listen = (name, handler, capture = false) => surface.addEventListener(name, handler,
      { capture, signal: this.listeners?.signal });
    listen('pointerdown', (event) => {
      if (!this.controlsEnabled || event.button !== 0) return;
      const touch = event.pointerType === 'touch';
      if (!touch && event.target && event.target !== canvas) return;
      if (!touch && pointers.size) return;
      if (touch && gesture?.type === 'mouse') return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      suppressedClicks.delete(event.pointerId);
      // Захват на исходном элементе сохраняет обычные нажатия кнопок.
      const target = touch && event.target?.setPointerCapture ? event.target : canvas;
      captureTargets.set(event.pointerId, target);
      target.setPointerCapture(event.pointerId);
      if (!touch) {
        gesture = { type: 'mouse', y: event.clientY, angle: this.verticalAngle };
        canvas.classList.add('is-dragging');
      } else if (pointers.size === 1) {
        gesture = { type: 'swipe', x: event.clientX, y: event.clientY };
      } else if (pointers.size === 2 && gesture?.type === 'swipe') {
        gesture = { type: 'tilt', y: midpoint(), angle: this.verticalAngle };
      } else {
        gesture = { type: 'cancelled' };
      }
    });
    listen('pointermove', (event) => {
      if (!this.controlsEnabled || !pointers.has(event.pointerId)) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (gesture?.type !== 'mouse' && gesture?.type !== 'tilt') return;
      const y = gesture.type === 'tilt' ? midpoint() : event.clientY;
      this.verticalAngle = THREE.MathUtils.clamp(gesture.angle + (y - gesture.y) * .2, 15, 85);
      this.fitCamera();
    });
    const end = (event) => {
      if (!pointers.has(event.pointerId)) return;
      const finished = gesture;
      const target = captureTargets.get(event.pointerId);
      pointers.delete(event.pointerId);
      gesture = pointers.size ? { type: 'cancelled' } : null;
      canvas.classList.remove('is-dragging');
      release(event.pointerId);
      if (event.type !== 'pointerup' || !this.controlsEnabled) return;
      if (finished?.type === 'tilt' || finished?.type === 'cancelled') {
        suppressedClicks.set(event.pointerId, { target, until: Date.now() + 800 });
        return;
      }
      if (finished?.type !== 'swipe') return;
      const dx = event.clientX - finished.x;
      const dy = event.clientY - finished.y;
      if (Math.hypot(dx, dy) < 24) return;
      suppressedClicks.set(event.pointerId, { target, until: Date.now() + 800 });
      this.onMove?.(this.swipeDirection(dx, dy));
    };
    listen('pointerup', end);
    listen('pointercancel', end);
    listen('lostpointercapture', end);
    listen('click', (event) => {
      if (event.detail === 0) return;
      for (const [id, entry] of suppressedClicks) {
        if (Date.now() > entry.until) {
          suppressedClicks.delete(id);
          continue;
        }
        if (event.pointerId === id || (event.pointerId === undefined
          && (entry.target === event.target || entry.target?.contains?.(event.target)))) {
          suppressedClicks.delete(id);
          event.preventDefault();
          event.stopImmediatePropagation();
          return;
        }
      }
    }, true);
  }

  resize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (!width || !height) return;
    // Размер интерфейса не ограничиваем; буфер рендера — не больше 3 Мп.
    const pixelRatio = Math.min(
      window.devicePixelRatio || 1,
      2,
      Math.sqrt(3_000_000 / (width * height)),
      this.maxRenderDimension / width,
      this.maxRenderDimension / height,
    );
    this.renderer.setDrawingBufferSize(width, height, pixelRatio);
    this.camera.aspect = width / height;
    this.fitCamera();
  }

  fitCamera() {
    const bounds = this.roomBounds ?? new THREE.Box3(
      new THREE.Vector3(-(this.map?.width ?? 8) / 2 - .3, -.5, -(this.map?.height ?? 8) / 2 - .3),
      new THREE.Vector3((this.map?.width ?? 8) / 2 + .3, this.roomHeight ?? 1.65, (this.map?.height ?? 8) / 2 + .3),
    );
    const target = bounds.getCenter(new THREE.Vector3());
    const angle = THREE.MathUtils.degToRad(this.verticalAngle);
    const progress = THREE.MathUtils.clamp((this.verticalAngle - sceneConfig.initialVerticalAngle) / (85 - sceneConfig.initialVerticalAngle), 0, 1);
    const horizontalAngle = THREE.MathUtils.lerp(Math.atan2(.6, .8), THREE.MathUtils.degToRad(5), progress);
    const direction = new THREE.Vector3(Math.sin(horizontalAngle) * Math.cos(angle), Math.sin(angle), Math.cos(horizontalAngle) * Math.cos(angle));
    this.camera.position.copy(target).add(direction);
    this.camera.lookAt(target);
    const inverseRotation = this.camera.quaternion.clone().invert();
    const tanHalfFov = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const tanHorizontal = tanHalfFov * this.camera.aspect;
    const minimum = new THREE.Vector2(Infinity, Infinity);
    const maximum = new THREE.Vector2(-Infinity, -Infinity);
    let nearest = -Infinity;
    const points = this.cameraFitPoints ?? [bounds.min.x, bounds.max.x].flatMap((x) =>
      [bounds.min.z, bounds.max.z].flatMap((z) =>
        [bounds.min.y, bounds.max.y].map((y) => new THREE.Vector3(x, y, z))));
    for (const corner of points) {
      const point = corner.clone().sub(target).applyQuaternion(inverseRotation);
      minimum.x = Math.min(minimum.x, point.x - tanHorizontal * point.z);
      maximum.x = Math.max(maximum.x, point.x + tanHorizontal * point.z);
      minimum.y = Math.min(minimum.y, point.y - tanHalfFov * point.z);
      maximum.y = Math.max(maximum.y, point.y + tanHalfFov * point.z);
      nearest = Math.max(nearest, point.z);
    }
    // Минимальное расстояние без обрезания; сдвиг центра убирает запас по краям.
    const distance = Math.max((maximum.x - minimum.x) / (2 * tanHorizontal),
      (maximum.y - minimum.y) / (2 * tanHalfFov), nearest + this.camera.near);
    const offset = new THREE.Vector3((maximum.x + minimum.x) / 2, (maximum.y + minimum.y) / 2, 0);
    target.add(offset.applyQuaternion(this.camera.quaternion));
    this.camera.position.copy(target).addScaledVector(direction, distance);
    this.camera.lookAt(target);
    this.camera.far = distance + bounds.getSize(new THREE.Vector3()).length();
    this.camera.updateProjectionMatrix();
  }

  frame(time) {
    const wasBusy = this.busy;
    if (this.animation) {
      const { objects, from, to, start, duration } = this.animation;
      const amount = Math.min(1, Math.max(0, (time - start) / duration));
      const smooth = amount * amount * (3 - 2 * amount);
      objects.forEach((object, index) => object.position.lerpVectors(from[index], to[index], smooth));
      if (amount === 1) this.animation = null;
    }
    this.boxes?.forEach((chest) => this.animateChest(chest, time));
    if (this.hintArrow) this.updateHintArrow(time);
    this.goalMeshes?.forEach((seal, index) => {
      seal.userData.rays.children.forEach((ray) => {
        const { height, phase, baseX, baseZ } = ray.userData;
        const wave = this.reduceMotion ? 0 : Math.sin(time * .002 + phase + index);
        const drift = this.reduceMotion ? 0 : Math.sin(time * .0013 + phase) * .018;
        ray.scale.y = 1 + wave * .22;
        ray.position.set(baseX + drift, height * ray.scale.y / 2, baseZ);
        ray.rotation.z = drift * 2;
        ray.material.opacity = (seal.userData.occupied ? .25 : .55) * (1 + wave * .3);
      });
    });
    this.animatePlayer(time);
    if (wasBusy && !this.busy) this.onIdle?.();
    this.animateFeather(time);
    this.renderer.render(this.scene, this.camera);
  }
}
