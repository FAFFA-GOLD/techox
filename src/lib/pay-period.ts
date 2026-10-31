/**
 * 給料日は月末。土日なら直前の平日。
 * 1期間は給料日〜次の給料日の前日。
 * 例: 2026-09-30〜2026-10-29、2026-10-30〜2026-11-29
 */

export type PayPeriod = {
  start: string;
  end: string;
  payday: string;
  nextPayday: string;
  label: string;
};

function ymd(year: number, monthIndex: number, day: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function weekdayUtc(year: number, monthIndex: number, day: number): number {
  return new Date(Date.UTC(year, monthIndex, day)).getUTCDay();
}

/** その月の給料日（月末が土日なら直前の平日） */
export function paydayOfMonth(year: number, monthIndex: number): string {
  let day = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  while (weekdayUtc(year, monthIndex, day) === 0 || weekdayUtc(year, monthIndex, day) === 6) {
    day -= 1;
  }
  return ymd(year, monthIndex, day);
}

function shiftMonth(year: number, monthIndex: number, delta: number): {
  year: number;
  monthIndex: number;
} {
  const cursor = new Date(Date.UTC(year, monthIndex + delta, 1));
  return { year: cursor.getUTCFullYear(), monthIndex: cursor.getUTCMonth() };
}

function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const cursor = new Date(Date.UTC(year, month - 1, day + days));
  return ymd(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate());
}

function labelOf(start: string, end: string): string {
  const fmt = (iso: string) => {
    const [y, m, d] = iso.split("-");
    return `${y}年${Number(m)}月${Number(d)}日`;
  };
  return `${fmt(start)}〜${fmt(end)}`;
}

/** date を含む給与期から count 期分。 */
export function payPeriodsFrom(date: string, count: number): PayPeriod[] {
  const periods: PayPeriod[] = [];
  let cursor = date;
  while (periods.length < count) {
    const period = payPeriodContaining(cursor);
    periods.push(period);
    cursor = period.nextPayday;
  }
  return periods;
}

/** date（yyyy-MM-dd）を含む給与期 */
export function payPeriodContaining(date: string): PayPeriod {
  const [year, month] = date.split("-").map(Number);
  const monthIndex = month - 1;
  let payday = paydayOfMonth(year, monthIndex);
  let startYear = year;
  let startMonth = monthIndex;
  if (date < payday) {
    const prev = shiftMonth(year, monthIndex, -1);
    startYear = prev.year;
    startMonth = prev.monthIndex;
    payday = paydayOfMonth(startYear, startMonth);
  }
  const next = shiftMonth(startYear, startMonth, 1);
  const nextPayday = paydayOfMonth(next.year, next.monthIndex);
  const end = addDays(nextPayday, -1);
  return {
    start: payday,
    end,
    payday,
    nextPayday,
    label: labelOf(payday, end),
  };
}
