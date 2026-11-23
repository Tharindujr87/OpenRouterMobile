import { test } from 'node:test';
import assert from 'node:assert/strict';
import { answerDateQuestion } from '../src/lib/dateAnswers.ts';

const NOW = new Date(2026, 10, 23, 15, 0, 0);
const QUESTIONS = `What is the day, month and year tomorrow?
Which week number in the year
How many weeks for the year`;

test('answers the three date questions without a model', () => {
  const answer = answerDateQuestion(QUESTIONS, NOW);
  assert.ok(answer);
  assert.match(answer, /Tomorrow is/);
  assert.match(answer, /24/);
  assert.match(answer, /2026/);
  assert.match(answer, /ISO week number: 48/);
  assert.match(answer, /53 ISO weeks/);
});

test('does not answer unrelated questions', () => {
  assert.equal(answerDateQuestion('What should I have for lunch?', NOW), null);
});

test('weekday question without tomorrow uses today', () => {
  const answer = answerDateQuestion('What day is it?', NOW);
  assert.match(answer ?? '', /Today is/);
});
