import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { modelCatalog, createCatalogModel, disposeModel } from '../src/model-catalog.js';
import { obstacleModels } from '../src/scene.js';
import { perimeterModels, decorationModels } from '../src/perimeter.js';
import { ModelFactory } from '../src/model-factory.js';

test('Каталог содержит все зарегистрированные модели с уникальными полными ID', () => {
  assert.equal(new Set(modelCatalog.map((entry) => entry.key)).size, modelCatalog.length);
  for (const [category, models] of [['obstacle', obstacleModels], ['perimeter', perimeterModels], ['decoration', decorationModels]]) {
    assert.deepEqual(modelCatalog.filter((entry) => entry.category === category).map((entry) => entry.id), models.map((entry) => entry.id));
  }
  assert.deepEqual(modelCatalog.filter((entry) => entry.category === 'game').map((entry) => entry.id), ['player', 'crate', 'goal', 'floor']);
});

test('Каждая модель и допустимая длина создаются настоящим генератором и стоят в центре просмотра', () => {
  for (const entry of modelCatalog) for (let span = 1; span <= entry.maxSpan; span++) {
    const model = createCatalogModel(entry, span);
    const bounds = new THREE.Box3().setFromObject(model);
    const center = bounds.getCenter(new THREE.Vector3());
    assert.equal(bounds.isEmpty(), false, `${entry.key}/${span}: есть геометрия`);
    assert.ok(Math.abs(center.x) < 1e-6 && Math.abs(center.z) < 1e-6, `${entry.key}: центрирован`);
    assert.ok(Math.abs(bounds.min.y) < 1e-6, `${entry.key}: стоит на полу`);
    assert.ok(bounds.max.y > 0 && Number.isFinite(bounds.max.y));
    disposeModel(model);
  }
  assert.throws(() => createCatalogModel(modelCatalog[0], modelCatalog[0].maxSpan + 1), /длина/);
});

test('Каталог создаёт самостоятельные модели без сцены и ресурсов другой модели', () => {
  const entry = modelCatalog.find((model) => model.id === 'crate' && model.category === 'game');
  const first = createCatalogModel(entry);
  const second = createCatalogModel(entry);
  const secondResources = new Set();
  second.traverse((node) => {
    if (node.geometry) secondResources.add(node.geometry);
    if (node.material) secondResources.add(node.material);
  });
  let disposed = 0;
  secondResources.forEach((resource) => resource.addEventListener('dispose', () => disposed++));
  disposeModel(first);
  assert.equal(disposed, 0);
  assert.ok(second.userData.chest.lid.parent === second);
  assert.ok(new THREE.Box3().setFromObject(second).max.y > 0);
  disposeModel(second);
  assert.ok(disposed > 0);
  const factory = new ModelFactory();
  assert.throws(() => factory.createObstacle('unknown'), /Неизвестная преграда/);
  assert.throws(() => factory.createObstacle('stack', 3), /длина/);
  assert.throws(() => createCatalogModel({ key: 'game/unknown', id: 'unknown', category: 'game', maxSpan: 1 }), /Неизвестная модель/);
});
