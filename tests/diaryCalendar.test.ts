import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diaryMonthCells } from '../src/lib/diaryCalendar.ts';

test('November 2026 grid starts on Monday and includes every day', () => {
  const cells = diaryMonthCells(2026, 10);
  assert.equal(cells.length % 7, 0);
  const days = cells.filter((cell): cell is Date => cell !== null);
  assert.equal(days.length, 30);
  // 1 Nov 2026 is a Sunday, so six blanks come first in a Monday-first grid.
  assert.equal(cells.slice(0, 6).every((cell) => cell === null), true);
  assert.equal(cells[6]?.getDate(), 1);
});

test('Mondays in a month can be found from the grid', () => {
  const mondays = diaryMonthCells(2026, 9)
    .filter((cell, index): cell is Date => cell !== null && index % 7 === 0)
    .map((cell) => cell.getDate());
  assert.deepEqual(mondays, [5, 12, 19, 26]);
});
