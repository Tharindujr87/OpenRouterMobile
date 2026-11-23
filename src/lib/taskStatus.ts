import type { Task } from './types';

export type TaskViewStatus = 'open' | 'due' | 'completed';

/** Due means a deadline has been reached or passed; open means no deadline yet. */
export function viewStatus(task: Task, now = new Date()): TaskViewStatus {
  if (task.status === 'done') return 'completed';
  if (task.dueAt !== null && task.dueAt <= now.getTime()) return 'due';
  return 'open';
}

export const STATUS_LABEL: Record<TaskViewStatus, string> = {
  open: 'Open',
  due: 'Due',
  completed: 'Completed',
};
