import * as THREE from 'three';
import { OrbitControls } from '../node_modules/three/examples/jsm/controls/OrbitControls.js';
import { modelCatalog, createCatalogModel, disposeModel } from './model-catalog.js';

const element = (id) => document.getElementById(id);
const categories = { obstacle: 'Преграды', perimeter: 'Периметр', decoration: 'Предметы декора', game: 'Игровые модели' };
const viewport = element('model-viewport');
const cards = new Map();
let selected;
let model;
let fitDistance = 3;

function makeScene() {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff0cf, 0x45585a, 2.5));
  const light = new THREE.DirectionalLight(0xffe5b8, 3.5);
  light.position.set(-4, 8, 6);
  scene.add(light);
  return scene;
}

function fit(camera, object, aspect) {
  const bounds = new THREE.Box3().setFromObject(object);
  const center = bounds.getCenter(new THREE.Vector3());
  const radius = bounds.getBoundingSphere(new THREE.Sphere()).radius;
  const vertical = THREE.MathUtils.degToRad(camera.fov / 2);
  const angle = Math.min(vertical, Math.atan(Math.tan(vertical) * aspect));
  const distance = Math.max(.3, radius * 1.18 / Math.sin(angle));
  camera.aspect = aspect;
  camera.near = .01;
  camera.far = Math.max(100, distance * 10);
  camera.position.copy(center).addScaledVector(new THREE.Vector3(2.7, 2, 4).normalize(), distance);
  camera.lookAt(center);
  camera.updateProjectionMatrix();
  return { center, distance };
}

try {
  const scene = makeScene();
  const camera = new THREE.PerspectiveCamera(35, 1, .01, 100);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0, 0);
  renderer.domElement.setAttribute('aria-label', 'Выбранная модель');
  viewport.append(renderer.domElement);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.autoRotateSpeed = 1.2;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.MeshStandardMaterial({ color: 0x34463c, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -.012;
  scene.add(floor);
  const grid = new THREE.GridHelper(12, 12, 0x938569, 0x526458);
  scene.add(grid);
  const render = () => renderer.render(scene, camera);

  function resetView() {
    const fitted = fit(camera, model, viewport.clientWidth / viewport.clientHeight);
    controls.target.copy(fitted.center);
    fitDistance = fitted.distance;
    controls.minDistance = fitDistance / 4;
    controls.maxDistance = fitDistance * 4;
    controls.update();
    element('model-zoom').value = 100;
    element('zoom-value').value = '100%';
  }

  function wireframe() {
    model.traverse((node) => {
      if (node.isMesh) node.material.wireframe = element('wireframe').checked;
    });
  }

  function showModel(entry, span = 1) {
    if (model) disposeModel(model);
    selected = entry;
    model = createCatalogModel(entry, span);
    scene.add(model);
    element('selected-category').textContent = categories[entry.category];
    element('selected-name').textContent = entry.name;
    element('selected-id').textContent = entry.key;
    element('model-source').textContent = entry.source;
    element('model-source').href = `./${entry.source}`;
    element('model-span').replaceChildren(...Array.from({ length: entry.maxSpan }, (_, i) => {
      const option = document.createElement('option');
      option.value = i + 1;
      option.textContent = `${i + 1} ${i === 0 ? 'плитка' : 'плитки'}`;
      return option;
    }));
    element('model-span').value = span;
    element('model-span').disabled = entry.maxSpan === 1;
    const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
    element('model-size').textContent = size.toArray().map((value) => value.toFixed(2)).join(' × ');
    let meshes = 0;
    let triangles = 0;
    model.traverse((node) => {
      if (!node.isMesh) return;
      meshes++;
      triangles += (node.geometry.index?.count ?? node.geometry.attributes.position.count) / 3;
    });
    element('model-geometry').textContent = `${meshes} мешей · ${Math.round(triangles)} треугольников`;
    element('model-usage').textContent = entry.category === 'perimeter'
      ? [entry.front && 'передний край (до 2 плиток)', entry.rear && 'задний край'].filter(Boolean).join(', ')
      : entry.category === 'decoration' ? 'Предмет на поверхности мебели' : entry.category === 'obstacle' ? 'Внутренняя преграда' : 'Игровая сцена';
    for (const [key, card] of cards) card.setAttribute('aria-pressed', String(key === entry.key));
    history.replaceState(null, '', `#${entry.key}?span=${span}`);
    wireframe();
    resetView();
    render();
  }

  function resize() {
    const width = viewport.clientWidth;
    const height = viewport.clientHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    if (model) resetView();
    render();
  }
  new ResizeObserver(resize).observe(viewport);

  function filter() {
    const search = element('model-search').value.trim().toLocaleLowerCase('ru');
    const category = element('model-category').value;
    let count = 0;
    for (const entry of modelCatalog) {
      const visible = (category === 'all' || entry.category === category) && `${entry.name} ${entry.key}`.toLocaleLowerCase('ru').includes(search);
      cards.get(entry.key).hidden = !visible;
      if (visible) count++;
    }
    element('catalog-count').textContent = `${count} из ${modelCatalog.length} моделей`;
    element('catalog-empty').hidden = count !== 0;
  }

  for (const entry of modelCatalog) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'model-card';
    card.dataset.model = entry.key;
    card.setAttribute('aria-pressed', 'false');
    const preview = document.createElement('img');
    preview.alt = '';
    const title = document.createElement('strong');
    title.textContent = entry.name;
    const id = document.createElement('code');
    id.textContent = entry.id;
    const category = document.createElement('small');
    category.textContent = `${categories[entry.category]} · ${entry.maxSpan === 1 ? '1 плитка' : `1–${entry.maxSpan} плитки`}`;
    card.append(preview, title, id, category);
    card.addEventListener('click', () => {
      showModel(entry);
      if (window.innerWidth <= 760) viewport.scrollIntoView({ block: 'center' });
    });
    cards.set(entry.key, card);
    element('model-grid').append(card);
  }
  filter();
  const [key, query] = location.hash.slice(1).split('?');
  const initial = modelCatalog.find((entry) => entry.key === key) ?? modelCatalog[0];
  const requestedSpan = Number(new URLSearchParams(query).get('span'));
  showModel(initial, Number.isInteger(requestedSpan) && requestedSpan >= 1 && requestedSpan <= initial.maxSpan ? requestedSpan : 1);
  resize();

  element('model-search').addEventListener('input', filter);
  element('model-category').addEventListener('change', filter);
  element('model-span').addEventListener('change', () => showModel(selected, Number(element('model-span').value)));
  element('regenerate').addEventListener('click', () => showModel(selected, Number(element('model-span').value)));
  element('reset-view').addEventListener('click', resetView);
  element('wireframe').addEventListener('change', wireframe);
  element('show-grid').addEventListener('change', () => { floor.visible = grid.visible = element('show-grid').checked; });
  element('auto-rotate').addEventListener('change', () => { controls.autoRotate = element('auto-rotate').checked; });
  function zoom(value) {
    const percent = THREE.MathUtils.clamp(value, 25, 400);
    camera.position.sub(controls.target).setLength(fitDistance * 100 / percent).add(controls.target);
    controls.update();
  }
  element('model-zoom').addEventListener('input', () => zoom(Number(element('model-zoom').value)));
  element('zoom-in').addEventListener('click', () => zoom(Number(element('model-zoom').value) * 1.2));
  element('zoom-out').addEventListener('click', () => zoom(Number(element('model-zoom').value) / 1.2));
  controls.addEventListener('change', () => {
    const percent = Math.round(fitDistance * 100 / camera.position.distanceTo(controls.target));
    element('model-zoom').value = percent;
    element('zoom-value').value = `${percent}%`;
  });
  document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => {
    const direction = { front: [0, 0, 1], back: [0, 0, -1], side: [1, 0, 0], top: [0, 1, .001] }[button.dataset.view];
    const distance = camera.position.distanceTo(controls.target);
    camera.position.copy(controls.target).addScaledVector(new THREE.Vector3(...direction).normalize(), distance);
    controls.update();
  }));
  viewport.addEventListener('keydown', (event) => {
    if (event.key === '+' || event.key === '=') zoom(Number(element('model-zoom').value) * 1.2);
    else if (event.key === '-') zoom(Number(element('model-zoom').value) / 1.2);
    else if (event.key.startsWith('Arrow')) {
      const offset = camera.position.clone().sub(controls.target);
      const spherical = new THREE.Spherical().setFromVector3(offset);
      if (event.key === 'ArrowLeft') spherical.theta -= .15;
      if (event.key === 'ArrowRight') spherical.theta += .15;
      if (event.key === 'ArrowUp') spherical.phi -= .15;
      if (event.key === 'ArrowDown') spherical.phi += .15;
      spherical.makeSafe();
      camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical));
      controls.update();
    } else return;
    event.preventDefault();
  });
  renderer.setAnimationLoop(() => { controls.update(); render(); });
  renderer.domElement.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    renderer.setAnimationLoop(null);
    element('catalog-error').textContent = 'WebGL-контекст потерян. Обновите страницу для восстановления просмотра.';
    element('catalog-error').hidden = false;
  });

  // Все миниатюры рисует один временный рендерер, а не отдельный WebGL-контекст на карточку.
  const thumbnailRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  thumbnailRenderer.outputColorSpace = THREE.SRGBColorSpace;
  thumbnailRenderer.setSize(320, 240);
  thumbnailRenderer.setClearColor(0, 0);
  const thumbnailScene = makeScene();
  const thumbnailCamera = new THREE.PerspectiveCamera(35, 4 / 3, .01, 100);
  for (const entry of modelCatalog) {
    const thumbnail = createCatalogModel(entry, entry.maxSpan);
    thumbnailScene.add(thumbnail);
    fit(thumbnailCamera, thumbnail, 4 / 3);
    thumbnailRenderer.render(thumbnailScene, thumbnailCamera);
    cards.get(entry.key).querySelector('img').src = thumbnailRenderer.domElement.toDataURL('image/png');
    disposeModel(thumbnail);
    await new Promise(requestAnimationFrame);
  }
  thumbnailRenderer.dispose();
} catch (error) {
  console.error(error);
  element('catalog-error').textContent = 'Не удалось загрузить каталог. Проверьте поддержку WebGL 2 и сообщения в консоли браузера.';
  element('catalog-error').hidden = false;
}
