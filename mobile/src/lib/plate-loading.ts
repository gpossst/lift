export const BAR_WEIGHT_LB = 45;
export const PLATE_INCREMENT_LB = 5;
export const MAX_BAR_WEIGHT_LB = 1_000;

const plateSizes = [45, 35, 25, 10, 5, 2.5] as const;

export function platesPerSide(totalWeight: number) {
  let remaining = Math.max(0, totalWeight - BAR_WEIGHT_LB) / 2;
  return plateSizes.flatMap((size) => {
    const count = Math.floor((remaining + Number.EPSILON) / size);
    remaining -= count * size;
    return Array.from({ length: count }, () => size);
  });
}

export function formatPlateCounts(plates: readonly number[]) {
  const counts = new Map<number, number>();
  for (const plate of plates) counts.set(plate, (counts.get(plate) ?? 0) + 1);
  const loading = Array.from(counts, ([plate, count]) => `${count > 1 ? `${count} × ` : ''}${plate}`).join(' + ');
  return loading ? `${loading} lb` : 'Bar only';
}
