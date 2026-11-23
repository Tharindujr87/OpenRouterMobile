import { test } from 'node:test';
import assert from 'node:assert/strict';
import { viewStatus } from '../src/lib/taskStatus.ts';
import type { Task } from '../src/lib/types.ts';

const NOW = new Date(2026, 10, 23, 15, 0, 0);

function task(patch: Partial<Task> = {}): Task {
  return {
    id: '1',
    title: 'Test',
    status: 'open',
    dueAt: null,
    reminderAt: null,
    notificationId: null,
    calendarEventId: null,
    completedAt: null,
    createdAt: NOW.getTime(),
    updatedAt: NOW.getTime(),
    ...patch,
  };
}

test('a task without a deadline is open', () => {
  assert.equal(viewStatus(task(), NOW), 'open');
});

test('a future deadline stays open', () => {
  assert.equal(viewStatus(task({ dueAt: NOW.getTime() + 86_400_000 }), NOW), 'open');
});

test('a reached or passed deadline is due', () => {
  assert.equal(viewStatus(task({ dueAt: NOW.getTime() - 1000 }), NOW), 'due');
});

test('a completed task is completed regardless of deadline', () => {
  assert.equal(
    viewStatus(task({ status: 'done', completedAt: NOW.getTime(), dueAt: NOW.getTime() - 1000 }), NOW),
    'completed',
  );
});
