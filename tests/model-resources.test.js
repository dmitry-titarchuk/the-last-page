import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { disposeModel } from '../src/model-resources.js';
import { RoomScene } from '../src/scene.js';

test('Общие геометрия, массивы материалов и текстуры освобождаются один раз', () => {
  const geometry = new THREE.BoxGeometry();
  const texture = new THREE.Texture();
  const normalMap = new THREE.Texture();
  const material = new THREE.MeshStandardMaterial({ map: texture, normalMap });
  const shader = new THREE.ShaderMaterial({ uniforms: { images: { value: [texture, normalMap] } } });
  const resources = [geometry, texture, normalMap, material, shader];
  const counts = new Map(resources.map((resource) => [resource, 0]));
  resources.forEach((resource) => resource.addEventListener('dispose', () => counts.set(resource, counts.get(resource) + 1)));
  const parent = new THREE.Group();
  const model = new THREE.Group();
  parent.add(model);
  model.add(new THREE.Mesh(geometry, [material, shader]), new THREE.Mesh(geometry, material));
  disposeModel(model);
  assert.equal(model.parent, null);
  assert.ok(resources.every((resource) => counts.get(resource) === 1));
});

test('Завершение сцены останавливает рендер и обработчики, освобождает комнату и тени', () => {
  const roomScene = Object.create(RoomScene.prototype);
  roomScene.scene = new THREE.Scene();
  roomScene.room = new THREE.Group();
  const geometry = new THREE.BoxGeometry();
  const material = new THREE.MeshBasicMaterial();
  roomScene.room.add(new THREE.Mesh(geometry, [material]));
  roomScene.scene.add(roomScene.room);
  const light = new THREE.DirectionalLight();
  let shadowDisposed = 0;
  light.shadow.dispose = () => shadowDisposed++;
  roomScene.scene.add(light);
  let rendersStopped = 0;
  let rendererDisposed = 0;
  let canvasRemoved = 0;
  let observerDisconnected = 0;
  let gestureCancelled = 0;
  let geometryDisposed = 0;
  geometry.addEventListener('dispose', () => geometryDisposed++);
  roomScene.renderer = {
    setAnimationLoop: (loop) => { assert.equal(loop, null); rendersStopped++; },
    dispose: () => rendererDisposed++,
    domElement: { remove: () => canvasRemoved++ },
  };
  roomScene.observer = { disconnect: () => observerDisconnected++ };
  roomScene.cancelControls = () => gestureCancelled++;
  roomScene.listeners = new AbortController();
  const surface = new EventTarget();
  let events = 0;
  surface.addEventListener('pointerdown', () => events++, { signal: roomScene.listeners.signal });
  roomScene.onMove = () => {};
  roomScene.dispose();
  roomScene.dispose();
  surface.dispatchEvent(new Event('pointerdown'));
  assert.equal(events, 0);
  assert.equal(roomScene.onMove, null);
  assert.equal(roomScene.scene.children.length, 0);
  assert.deepEqual([rendersStopped, rendererDisposed, canvasRemoved, observerDisconnected, gestureCancelled, geometryDisposed, shadowDisposed], [1, 1, 1, 1, 1, 1, 1]);
});
