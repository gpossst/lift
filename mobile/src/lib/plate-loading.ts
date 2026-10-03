export const BAR_WEIGHT_LB = 45;
export const PLATE_INCREMENT_LB = 5;
export const MAX_BAR_WEIGHT_LB = 1_000;

const plateSizes = [45, 35, 25, 10, 5, 2.5] as const;
// One unit is 2.5 lb per side, or 5 lb on the bar. Prefer larger plates
// when two layouts use the same minimum number of plates.
const plateLayouts: number[][] = [[]];
for (let units = 1; units <= (MAX_BAR_WEIGHT_LB - BAR_WEIGHT_LB) / PLATE_INCREMENT_LB; units += 1) {
  let best: number[] | undefined;
  for (const plate of plateSizes) {
    const previous = plateLayouts[units - plate / 2.5];
    if (previous && (!best || previous.length + 1 < best.length)) best = [plate, ...previous];
  }
  plateLayouts.push(best!);
}

export function platesPerSide(totalWeight: number) {
  if (!Number.isFinite(totalWeight) || totalWeight > MAX_BAR_WEIGHT_LB) throw new RangeError('Bar weight must be finite and at most 1,000 lb.');
  const units = Math.floor(Math.max(0, totalWeight - BAR_WEIGHT_LB) / PLATE_INCREMENT_LB);
  return [...plateLayouts[units]];
}

export function formatPlateCounts(plates: readonly number[]) {
  const counts = new Map<number, number>();
  for (const plate of plates) counts.set(plate, (counts.get(plate) ?? 0) + 1);
  const loading = Array.from(counts, ([plate, count]) => `${count > 1 ? `${count} × ` : ''}${plate}`).join(' + ');
  return loading ? `${loading} lb` : 'Bar only';
}
