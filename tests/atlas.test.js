import test from 'node:test';
import assert from 'node:assert/strict';
import { levels } from '../src/levels.js';
import { locations, locationLevels, levelAvailable, readProgress, saveProgress, roomMiniature } from '../src/atlas.js';

test('миниатюра сохраняет пустоты и использует ширину самой длинной строки', () => {
  const miniature = roomMiniature(['  ###', '### .#', '#@$  #', '#    #', '######']);
  assert.ok(miniature.includes('viewBox="0 0 60 50"'));
  assert.ok(!miniature.includes('<rect x="1" y="1"'));
  assert.ok(!miniature.includes('<rect x="11" y="1"'));
  assert.ok(miniature.includes('<rect x="21" y="1"'));
});

test('пять карт содержат по семь задач Microban в исходном порядке', () => {
  assert.equal(locations.length, 5);
  const assigned = locations.flatMap((location) => location.levelIds);
  assert.equal(new Set(assigned).size, 35);
  assert.deepEqual(assigned, levels.map((level) => level.id));
  locations.forEach((location, locationIndex) => {
    const rooms = locationLevels(location);
    assert.equal(rooms.length, 7);
    assert.deepEqual(rooms.map((room) => room.source.number), Array.from({ length: 7 }, (_, i) => locationIndex * 7 + i + 1));
    const otherRooms = locations.filter((other) => other !== location).flatMap((other) => other.levelIds);
    const completed = new Set(otherRooms);
    for (let count = 0; count <= rooms.length; count++) {
      assert.deepEqual(rooms.map((_, i) => levelAvailable(location, i, completed)), rooms.map((_, i) => i <= count));
      if (rooms[count]) completed.add(rooms[count].id);
    }
    assert.equal(levelAvailable(location, rooms.length, completed), false);
    const repeated = new Set([rooms.at(-1).id]);
    assert.equal(levelAvailable(location, rooms.length - 1, repeated), true, 'Пройденная комната остаётся доступна');
  });
  assert.equal(levelAvailable({ levelIds: [] }, 0, new Set()), false);
});

test('прогресс переживает загрузку и повреждённые либо недоступные сохранения', () => {
  let value;
  const storage = { getItem: () => value, setItem: (_, data) => { value = data; } };
  saveProgress(storage, new Set(['microban-01', 'microban-02']));
  assert.deepEqual([...readProgress(storage)], ['microban-01', 'microban-02']);
  value = '["microban-01", "office", "unknown"]';
  assert.deepEqual([...readProgress(storage)], ['microban-01']);
  value = '["islands-port", "castle-tower", "pages-passage", "library-ending", "microban-01"]';
  assert.deepEqual([...readProgress(storage)], ['microban-01', 'microban-06', 'microban-08', 'microban-13']);
  for (const invalid of ['{', '{}', 'null']) {
    value = invalid;
    assert.equal(readProgress(storage).size, 0);
  }
  assert.equal(readProgress(undefined).size, 0);
  assert.doesNotThrow(() => saveProgress(undefined, new Set(['microban-01'])));
});
