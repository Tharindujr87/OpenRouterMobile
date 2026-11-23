import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  basicCleanup,
  deterministicDaySummary,
  diaryQuery,
  displayDay,
  localDay,
} from '../src/lib/diary.ts';
import type { DiaryEntry } from '../src/lib/types.ts';

const NOW = new Date(2026, 10, 23, 15, 0, 0);

test('localDay uses the device date, not UTC', () => {
  assert.equal(localDay(NOW), '2026-11-23');
  assert.match(displayDay('2026-11-23'), /2026/);
});

const JOE_NOTE = `as requested by zia I had a conversaion with Joe and his mom ellen regarding the electricity bill and the unautoarised female in the house as who mentioned as Crag's (Joe's friend) friend.

after the conversaion with the cops, Joe has to request from them to leave the house, they are not welcome at the property any more. and if he doesn't feel confident support worker can request behalf of them. We might have to give them few days to pack and go.

everyone agreed.
waiting until joe return from RAH (Royal Adelaide hospital).`;

test('offline cleanup keeps every fact and invents nothing', () => {
  const draft = basicCleanup(JOE_NOTE);
  assert.equal(draft.body, JOE_NOTE.trim());
  assert.equal(draft.original, JOE_NOTE);
  assert.deepEqual(draft.tags, []);
});

test('summary leads with the agreement and what is pending', () => {
  const draft = basicCleanup(JOE_NOTE);
  assert.match(draft.summary, /has to request/i);
  assert.match(draft.summary, /everyone agreed/i);
  assert.match(draft.summary, /waiting until joe return/i);
  assert.doesNotMatch(draft.summary, /^as requested by zia/i);
});

test('a conversation without place or time asks neutral questions', () => {
  const questions = basicCleanup(JOE_NOTE).questions;
  assert.equal(questions.length, 2);
  assert.match(questions[0], /where/i);
  assert.match(questions[1], /what time/i);
});

test('details already given are not asked again', () => {
  const draft = basicCleanup('I spoke with Ellen by phone at 2pm about the bill.');
  assert.deepEqual(draft.questions, []);
});

test('notes that are not conversations get no questions', () => {
  assert.deepEqual(basicCleanup('Bought milk and bread.').questions, []);
});

test('diary questions produce search terms without stopwords', () => {
  const terms = diaryQuery('what happened with Joe about the electricity bill?');
  assert.ok(terms);
  assert.ok(terms.includes('joe'));
  assert.ok(terms.includes('electricity'));
  assert.ok(!terms.includes('what'));
});

test('non-diary questions are not searched', () => {
  assert.equal(diaryQuery('what should I have for lunch?'), null);
});

test('day summary is one line per entry', () => {
  const entry: DiaryEntry = {
    id: '1',
    day: '2026-11-23',
    body: 'Full detail',
    original: 'raw detail',
    summary: 'Spoke with Ellen about the bill',
    tags: ['Ellen'],
    photos: [],
    createdAt: NOW.getTime(),
    updatedAt: NOW.getTime(),
  };
  const summary = deterministicDaySummary('2026-11-23', [entry]);
  assert.match(summary, /Spoke with Ellen about the bill/);
  assert.equal(summary.split('\n').filter((line) => /^\d+\./.test(line)).length, 1);
});
