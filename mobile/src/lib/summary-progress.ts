type SetPerformance = { weight: number; reps: number };
type HistorySet = SetPerformance & { workoutId: string; completedAt: Date };

export function exerciseProgress(sets: SetPerformance[], history: HistorySet[], workoutId: string, completedAt: Date, weighted: boolean) {
  const prior = history.filter((set) => set.workoutId !== workoutId && set.completedAt.getTime() <= completedAt.getTime());
  const previousWorkoutId = prior.at(-1)?.workoutId;
  const previous = prior.filter((set) => set.workoutId === previousWorkoutId);
  if (!previous.length) return { improved: false, label: 'First time logged' };

  const best = (items: SetPerformance[]) => Math.max(...items.map((set) => weighted ? set.weight : set.reps));
  const bestDifference = best(sets) - best(previous);
  const total = (items: SetPerformance[]) => items.reduce((sum, set) => sum + (weighted ? set.weight * set.reps : set.reps), 0);
  const totalDifference = total(sets) - total(previous);
  if (bestDifference > 0) return { improved: true, label: `↑ ${bestDifference} ${weighted ? 'lb' : 'reps'} on your best set` };
  if (totalDifference > 0) return { improved: true, label: `↑ ${totalDifference} ${weighted ? 'lb volume' : 'total reps'} from last time` };
  return { improved: false, label: `Last time: ${best(previous)} ${weighted ? 'lb' : 'reps'} best set` };
}
