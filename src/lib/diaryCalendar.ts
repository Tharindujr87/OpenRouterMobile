export function diaryMonthCells(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1, 12);
  const offset = (first.getDay() + 6) % 7; // Monday first.
  const count = new Date(year, month + 1, 0, 12).getDate();
  return Array.from({ length: Math.ceil((offset + count) / 7) * 7 }, (_, index) => {
    const day = index - offset + 1;
    return day > 0 && day <= count ? new Date(year, month, day, 12) : null;
  });
}
