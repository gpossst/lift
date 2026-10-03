/** Match the sync API limits before a set reaches local storage. */
export function isValidWorkoutSetValues(values: { weight: number; reps: number }): boolean {
  return Number.isFinite(values.weight) && values.weight >= 0 && values.weight <= 10_000
    && Math.abs(values.weight * 100 - Math.round(values.weight * 100)) < 1e-8
    && Number.isInteger(values.reps) && values.reps > 0 && values.reps <= 10_000;
}

export function assertValidWorkoutSet(set: { weight: number; reps: number; setNumber: number; completedAt: Date }): void {
  const timestamp = Math.floor(set.completedAt.getTime() / 1000);
  if (!isValidWorkoutSetValues(set) || !Number.isInteger(set.setNumber) || set.setNumber < 1 || set.setNumber > 100
    || !Number.isFinite(timestamp) || timestamp < 0 || timestamp > 4_102_444_800) {
    throw new Error('Use a weight from 0–10,000 lb with at most two decimal places, 1–10,000 whole reps, and set numbers from 1–100.');
  }
}
