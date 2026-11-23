import { test } from 'node:test';
import assert from 'node:assert/strict';
import { looksLikeMultiAction, splitLocally } from '../src/lib/actionProposals.ts';
import { buildSystemPrompt } from '../src/lib/ai.ts';

const NOW = new Date(2026, 10, 23, 15, 0, 0);

const INPUT = `Pick up Joe from the hospital tomorrow.

Before that, I have to talk to Ellen, Joe's mom.
Message Sumali to arrange a shift.`;

test('a note plus a poem request stays in chat in both modes', () => {
  const input = `this is my first testing note.

Write a poem a bout a man finished his first shed in 20 years`;
  assert.equal(looksLikeMultiAction(input), false);
});

test('two real action lines still open the action review', () => {
  const input = `Pick up Joe from the hospital tomorrow.
Message Sumali to arrange a shift.`;
  assert.equal(looksLikeMultiAction(input), true);
});

test('a single action line plus a poem does not open the review', () => {
  const input = `Call the plumber tomorrow.
Write a poem about the shed.`;
  assert.equal(looksLikeMultiAction(input), false);
});

test('multi-line questions stay in chat instead of becoming tasks', () => {
  const questions = `What is the day, month and year tomorrow?
Which week number in the year
How many weeks for the year`;
  assert.equal(looksLikeMultiAction(questions), false);
});

test('an explicit command inside a mixed message still opens the action review', () => {
  const mixed = `What is the week number tomorrow?
add task buy milk`;
  assert.equal(looksLikeMultiAction(mixed), true);
});

test('multi-line input is detected as a proposed-action breakdown', () => {
  assert.equal(looksLikeMultiAction(INPUT), true);
  assert.equal(looksLikeMultiAction('What should I have for lunch?'), false);
});

test('local breakdown resolves tomorrow from the device date, not the model', () => {
  const actions = splitLocally(INPUT, NOW);
  assert.equal(actions.length, 3);
  const pickup = actions.find((action) => action.title.includes('Pick up Joe'));
  assert.ok(pickup);
  assert.equal(pickup?.kind, 'task');
  assert.equal(new Date(pickup?.dueAt ?? 0).getDate(), 24);
  assert.equal(new Date(pickup?.dueAt ?? 0).getMonth(), 10);
});

test('undated lines stay undated', () => {
  const actions = splitLocally(INPUT, NOW);
  const ellen = actions.find((action) => action.title.includes('Ellen'));
  const sumali = actions.find((action) => action.title.includes('Sumali'));
  assert.equal(ellen?.dueAt, null);
  assert.equal(sumali?.dueAt, null);
});

test('system prompt gives the local date and allows model-side date answers', () => {
  const prompt = buildSystemPrompt({}, NOW);
  assert.match(prompt, /local date and time right now/);
  assert.match(prompt, /2026-11-23/);
  assert.match(prompt, /You MAY calculate and state dates/);
  assert.match(prompt, /never on your own assumed current date/);
});
