function key(userId: string, kind: 'date' | 'asked') { return `lift-return-plan:${userId}:${kind}`; }

export function getReturnPlan(userId: string): string | null {
  try { return globalThis.localStorage?.getItem(key(userId, 'date')) ?? null; } catch { return null; }
}

export function hasAskedReturnPlan(userId: string) {
  try { return globalThis.localStorage?.getItem(key(userId, 'asked')) === 'true'; } catch { return false; }
}

export function saveReturnPlan(userId: string, value: string | null) {
  try {
    if (value === null) globalThis.localStorage?.removeItem(key(userId, 'date'));
    else globalThis.localStorage?.setItem(key(userId, 'date'), value);
    globalThis.localStorage?.setItem(key(userId, 'asked'), 'true');
  } catch { /* The prompt still completes if browser storage is unavailable. */ }
}

export function clearReturnPlan(userId: string) {
  try {
    globalThis.localStorage?.removeItem(key(userId, 'date'));
    globalThis.localStorage?.removeItem(key(userId, 'asked'));
  } catch { /* Browser storage may be unavailable. */ }
}
