import type { CloudSyncRejectedChange } from '@/db';
import { isValidWorkoutSetValues } from '@/lib/workout-set-validation';

export function cloudSyncIssueDescription(issue: CloudSyncRejectedChange): string {
  if (issue.conflict) return issue.reason;
  if (issue.entity === 'set' && issue.record && !isValidWorkoutSetValues({ weight: Number(issue.record.weight), reps: Number(issue.record.reps) })) {
    return 'This set is saved on this device, but its weight or reps could not be uploaded. Edit its weight or reps before resubmitting.';
  }
  return 'This change could not be uploaded. It is saved on this device. Resubmit to try again.';
}
