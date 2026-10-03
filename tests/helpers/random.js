// Генераторы Three.js часто вызывают random: для проверки геометрии нужна
// заданная последовательность значений, а не журнал каждого вызова.
export function setRandom(t, implementation) {
  const previous = Math.random;
  Math.random = implementation;
  t.after(() => { Math.random = previous; });
}
