import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { subscribeWorkoutData } from '@/lib/cloud-sync';

/** Reload on screen focus and when sync updates the local workout data. */
export function useWorkoutData<T>(load: () => T): T {
  const [data, setData] = useState(load);
  useFocusEffect(useCallback(() => {
    const refresh = () => setData(load());
    refresh();
    return subscribeWorkoutData(refresh);
  }, [load]));
  return data;
}
