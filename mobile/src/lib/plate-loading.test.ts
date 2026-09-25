import { formatPlateCounts, platesPerSide } from './plate-loading';

function deepEqual(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

deepEqual(platesPerSide(45), []);
deepEqual(platesPerSide(135), [45]);
deepEqual(platesPerSide(225), [45, 45]);
deepEqual(platesPerSide(200), [45, 25, 5, 2.5]);
deepEqual(formatPlateCounts([]), 'Bar only');
deepEqual(formatPlateCounts([45, 45, 35]), '2 × 45 + 35 lb');
deepEqual(formatPlateCounts([45, 10, 5, 2.5]), '45 + 10 + 5 + 2.5 lb');
