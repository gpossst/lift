type SearchableExercise = { id: string; name: string; area?: string; equipment?: string; detailsJson?: string | null };
type SearchIndex = { name: string; names: string[]; attributes: string };

// Alternate names point to existing movements, so logging keeps the same exercise ID.
const aliases: Record<string, string[]> = {
  'Barbell_Bench_Press_-_Medium_Grip': ['bench press', 'barbell bench press', 'flat bench press'],
  Barbell_Squat: ['back squat', 'barbell back squat'],
  Barbell_Deadlift: ['deadlift', 'conventional deadlift'],
  Standing_Military_Press: ['overhead press', 'standing overhead press', 'barbell shoulder press', 'military press'],
  Seated_Barbell_Military_Press: ['seated overhead press', 'seated barbell shoulder press'],
  Dumbbell_Shoulder_Press: ['dumbbell overhead press'],
  Romanian_Deadlift: ['rdl'],
  Pullups: ['pull up', 'pull ups'],
  Pushups: ['push up', 'push ups', 'press up', 'press ups'],
  'Chin-Up': ['chin up', 'chin ups'],
  'EZ-Bar_Skullcrusher': ['skull crusher', 'skull crushers', 'ez bar triceps extension'],
  Lying_Triceps_Press: ['lying triceps extension', 'barbell skull crusher'],
  Butterfly: ['pec deck', 'pec deck fly', 'machine chest fly'],
  Reverse_Machine_Flyes: ['reverse pec deck', 'machine rear delt fly'],
  Side_Lateral_Raise: ['lateral raise', 'dumbbell lateral raise', 'side raise'],
  Bent_Over_Barbell_Row: ['barbell row', 'bent over row'],
  Barbell_Hip_Thrust: ['hip thrust'],
};

function normalize(value: string) {
  return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim()
    .replace(/\b(?:pull|push|chin) ups?\b/g, (word) => word.replace(/ /g, '').replace(/s$/, ''))
    .replace(/\b(pullups|pushups|chinups)\b/g, (word) => word.slice(0, -1))
    .replace(/\b(db|bb|ohp|rdl|flyes|flye|flies|skullcrushers|skullcrusher)\b/g, (word) => ({
      db: 'dumbbell', bb: 'barbell', ohp: 'overhead press', rdl: 'romanian deadlift',
      flyes: 'fly', flye: 'fly', flies: 'fly', skullcrushers: 'skull crusher', skullcrusher: 'skull crusher',
    })[word]!);
}

const searchIndexes = new WeakMap<SearchableExercise, SearchIndex>();

function indexExercise(exercise: SearchableExercise): SearchIndex {
  const cached = searchIndexes.get(exercise);
  if (cached) return cached;
  const name = normalize(exercise.name);
  const names = [name, ...(aliases[exercise.id.replace(/^free_exercise_db:/, '')] ?? []).map(normalize)];
  let muscles: string[] = [];
  try { const details = JSON.parse(exercise.detailsJson ?? '{}'); muscles = [...(details.primaryMuscles ?? []), ...(details.secondaryMuscles ?? [])]; } catch { /* Older rows may lack details. */ }
  const index = { name, names, attributes: normalize(`${names.join(' ')} ${exercise.area ?? ''} ${exercise.equipment ?? ''} ${muscles.join(' ')}`) };
  searchIndexes.set(exercise, index);
  return index;
}

export function searchExercises<T extends SearchableExercise>(exercises: readonly T[], query: string, compare?: (a: T, b: T) => number): T[] {
  const search = normalize(query);
  if (!search) return compare ? exercises.slice().sort(compare) : exercises.slice();
  const terms = search.split(' ');
  return exercises.map((exercise) => {
    const { name, names, attributes } = indexExercise(exercise);
    let score = name === search ? 100 : names.includes(search) ? 90 : 0;
    for (const candidate of names) {
      if (candidate.startsWith(search)) score = Math.max(score, 70);
      else if (candidate.includes(search)) score = Math.max(score, 60);
      else if (terms.every((term) => candidate.includes(term))) score = Math.max(score, 50);
    }
    if (!score && terms.every((term) => attributes.includes(term))) score = 10;
    return { exercise, score };
  }).filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || (compare?.(a.exercise, b.exercise) ?? 0))
    .map(({ exercise }) => exercise);
}
