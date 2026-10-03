import { readdir } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
export const legalFiles = ['LICENSE', 'NOTICE', 'THIRD_PARTY_NOTICES.txt', 'node_modules/three/LICENSE'];

async function collect(directory, extension) {
  const result = [];
  for (const entry of await readdir(new URL(directory, root), { withFileTypes: true })) {
    const name = `${directory}${entry.name}`;
    if (entry.isDirectory()) result.push(...await collect(`${name}/`, extension));
    else if (entry.isFile() && entry.name.endsWith(extension)) result.push(name);
  }
  return result;
}

// Общий список ресурсов сайта; импорт модуля не создаёт и не меняет файлы.
export const assets = [
  'index.html', 'styles.css', 'models.html', 'models.css',
  'licensing.html', ...legalFiles,
  'node_modules/three/build/three.module.js', 'node_modules/three/build/three.core.js',
  'node_modules/three/examples/jsm/controls/OrbitControls.js',
  ...await collect('src/', '.js'),
].sort();
