export function getReturnPlan(userId: string): string | null;
export function hasAskedReturnPlan(userId: string): boolean;
export function saveReturnPlan(userId: string, value: string | null): void;
export function clearReturnPlan(userId: string): void;
