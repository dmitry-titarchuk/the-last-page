import * as THREE from 'three';
import { ModelFactory } from './model-factory.js';
import { obstacleModels, perimeterModels, decorationModels } from './model-registry.js';
import { createPerimeterModel, createDecorationModel } from './furniture-models.js';
export { disposeModel } from './model-resources.js';

export const modelCatalog = [
  ...obstacleModels.map((model) => ({ ...model, category: 'obstacle', source: 'src/model-factory.js', maxSpan: model.maxSpan ?? 1 })),
  ...perimeterModels.map((model) => ({ ...model, category: 'perimeter', source: 'src/furniture-models.js' })),
  ...decorationModels.map((model) => ({ ...model, category: 'decoration', source: 'src/furniture-models.js', maxSpan: 1 })),
  ...[
    { id: 'player', name: 'Герой с пером' },
    { id: 'crate', name: 'Дорожный сундук' },
    { id: 'goal', name: 'Портрет писателя в золотой рамке' },
    { id: 'floor', name: 'Плитка пола' },
  ].map((model) => ({ ...model, category: 'game', source: 'src/model-factory.js', maxSpan: 1 })),
].map((model) => ({ ...model, key: `${model.category}/${model.id}` }));

export function createCatalogModel(entry, span = 1) {
  const registered = modelCatalog.find((model) => model.key === entry.key);
  if (!registered || registered.id !== entry.id || registered.category !== entry.category) {
    throw new Error('Неизвестная модель каталога');
  }
  entry = registered;
  const builder = new ModelFactory();
  if (!Number.isInteger(span) || span < 1 || span > entry.maxSpan) throw new Error('Недопустимая длина модели');
  let model;
  if (entry.category === 'obstacle') model = builder.createObstacle(entry.id, span);
  else if (entry.category === 'perimeter') model = createPerimeterModel(builder, entry.id, span);
  else if (entry.category === 'decoration') model = createDecorationModel(builder, entry.id);
  else if (entry.id === 'floor') {
    model = new THREE.Group();
    builder.block(model, [.96, .14, .96], [0, .07, 0], builder.material(0x655948));
  } else if (entry.id === 'player') model = builder.createPlayer();
  else if (entry.id === 'crate') model = builder.createMovableChest();
  else model = builder.createGoalSeal();
  // Единая ориентация в каталоге; случайные цвета и состав предметов сохраняются.
  if (entry.category !== 'game') model.rotation.y = 0;
  const bounds = new THREE.Box3().setFromObject(model);
  const center = bounds.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= bounds.min.y;
  return model;
}
