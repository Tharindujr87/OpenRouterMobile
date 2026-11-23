import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCapture } from '../src/lib/parse.ts';
import { resolveWhen, flipMeridiem } from '../src/lib/dates.ts';

// Monday 23 November 2026, 10:00 local time.
const NOW = new Date(2026, 10, 23, 10, 0, 0);

function hourOf(ts: number | null): number | null {
  return ts === null ? null : new Date(ts).getHours();
}

function dateOf(ts: number | null): number | null {
  return ts === null ? null : new Date(ts).getDate();
}

test('plain note keeps its full wording and schedules nothing', () => {
  const result = parseCapture('Note: ask supplier about bulk pricing next time we talk', NOW);
  assert.equal(result.kind, 'note');
  assert.match(result.body, /next time we talk/);
  assert.equal(result.reminderAt, null);
  assert.equal(result.dueAt, null);
});

test('task without a deadline does not invent one', () => {
  const result = parseCapture('add task order replacement filters', NOW);
  assert.equal(result.kind, 'task');
  assert.equal(result.title, 'order replacement filters');
  assert.equal(result.dueAt, null);
  assert.equal(result.reminderAt, null);
});

test('bare hour uses the everyday reading (9 -> AM, 5 -> PM) and is flagged ambiguous', () => {
  const result = parseCapture('remind me tomorrow at 9 to call supplier', NOW);
  assert.equal(result.kind, 'reminder');
  assert.equal(result.title, 'call supplier');
  assert.equal(result.ambiguousTime, true);
  assert.equal(hourOf(result.reminderAt), 9);
  assert.equal(dateOf(result.reminderAt), 24);
});

test('explicit pm is not ambiguous', () => {
  const result = parseCapture('remind me Thursday at 2pm to see dentist', NOW);
  assert.equal(result.title, 'see dentist');
  assert.equal(result.ambiguousTime, false);
  assert.equal(hourOf(result.reminderAt), 14);
});

test('deadline and reminder are kept separate', () => {
  const result = parseCapture(
    'add task finish the quote by Friday at 5, remind me Thursday afternoon',
    NOW,
  );
  assert.equal(result.kind, 'task');
  assert.equal(hourOf(result.dueAt), 17);
  assert.equal(dateOf(result.dueAt), 27);
  assert.equal(result.reminderAt, null);
});

test('reminder with a deadline records both', () => {
  const result = parseCapture(
    'remind me Thursday afternoon to send the quote, due Friday',
    NOW,
  );
  assert.equal(result.kind, 'reminder');
  assert.ok(result.reminderAt !== null);
  assert.ok(result.dueAt !== null);
  assert.equal(dateOf(result.dueAt), 27);
});

test('missing time is reported instead of guessed', () => {
  const result = parseCapture('remind me to call the supplier', NOW);
  assert.equal(result.needsTime, true);
  assert.equal(result.reminderAt, null);
  assert.equal(result.title, 'call the supplier');
});

test('unrecognised input asks how to classify it', () => {
  const result = parseCapture('call the supplier tomorrow', NOW);
  assert.equal(result.kind, 'unknown');
  assert.equal(result.reminderAt, null);
  assert.match(result.hints[0], /Start with/);
});

test('next monday means the Monday of the following week', () => {
  const result = resolveWhen(NOW, { type: 'nextweekday', weekday: 1 }, { hour: 9, minute: 0 });
  assert.equal(new Date(result.timestamp).getDate(), 30);
});

test('AM/PM toggle flips an ambiguous time', () => {
  const result = parseCapture('remind me tomorrow at 9 to call supplier', NOW);
  assert.equal(result.reminderAt !== null, true);
  const flipped = flipMeridiem(result.reminderAt!);
  assert.equal(new Date(flipped).getHours(), 21);
  assert.equal(new Date(flipped).getDate(), 24);
});
