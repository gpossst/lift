import { BAR_WEIGHT_LB, formatPlateCounts, MAX_BAR_WEIGHT_LB, PLATE_INCREMENT_LB, platesPerSide } from './plate-loading';

function deepEqual(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

deepEqual(platesPerSide(45), []);
deepEqual(platesPerSide(135), [45]);
deepEqual(platesPerSide(225), [45, 45]);
deepEqual(platesPerSide(200), [45, 25, 5, 2.5]);
deepEqual(platesPerSide(165), [35, 25]);
deepEqual(platesPerSide(0), []);
deepEqual(formatPlateCounts([]), 'Bar only');
deepEqual(formatPlateCounts([45, 45, 35]), '2 × 45 + 35 lb');
deepEqual(formatPlateCounts([45, 10, 5, 2.5]), '45 + 10 + 5 + 2.5 lb');

// Breadth-first enumeration establishes the fewest plates needed for every
// supported weight, independently of the layout's denomination tie-breaking.
const maxUnits = (MAX_BAR_WEIGHT_LB - BAR_WEIGHT_LB) / PLATE_INCREMENT_LB;
const minimumCounts = new Map<number, number>([[0, 0]]);
let frontier = [0];
for (let count = 1; frontier.length; count += 1) {
  const next: number[] = [];
  for (const sum of frontier) for (const plate of [45, 35, 25, 10, 5, 2.5]) {
    const units = sum + plate / 2.5;
    if (units > maxUnits || minimumCounts.has(units)) continue;
    minimumCounts.set(units, count);
    next.push(units);
  }
  frontier = next;
}
for (let units = 0; units <= maxUnits; units += 1) {
  const plates = platesPerSide(BAR_WEIGHT_LB + units * PLATE_INCREMENT_LB);
  deepEqual(plates.length, minimumCounts.get(units));
  deepEqual(plates.reduce((sum, plate) => sum + plate, 0), units * 2.5);
  deepEqual(plates, [...plates].sort((a, b) => b - a));
}
const mutableLayout = platesPerSide(165);
mutableLayout.pop();
deepEqual(platesPerSide(165), [35, 25]);
for (const weight of [NaN, Infinity, MAX_BAR_WEIGHT_LB + PLATE_INCREMENT_LB]) {
  let rejected = false;
  try { platesPerSide(weight); } catch (error) { rejected = error instanceof RangeError; }
  deepEqual(rejected, true);
}
