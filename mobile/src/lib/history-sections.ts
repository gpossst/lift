import type { WorkoutVisitSummary } from '@/db';

const monthFormatter = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });

export function groupWorkoutVisits(visits: WorkoutVisitSummary[]) {
  const sections: { key: string; title: string; data: WorkoutVisitSummary[] }[] = [];
  for (const visit of visits) {
    const date = visit.workout.endedAt ?? visit.workout.createdAt;
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    if (sections.at(-1)?.key !== key) sections.push({ key, title: monthFormatter.format(date), data: [] });
    sections.at(-1)!.data.push(visit);
  }
  return sections;
}
