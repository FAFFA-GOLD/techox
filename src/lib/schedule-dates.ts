import { addMonths } from "date-fns";
import { dateOnDay } from "@/lib/money";

/** 取引を保存したときに先へ作る月数 */
export const SCHEDULE_HORIZON_MONTHS = 24;

export type ScheduleDateInput = {
  day_of_month: number;
  interval_months: number;
  start_date: string;
  end_date: string | null;
};

/**
 * fromMonthKey（yyyy-MM）から horizonMonths か月分の発生日。
 * 開始月からの月差が interval_months の倍数の月だけ。
 */
export function scheduleOccurrenceDates(
  rule: ScheduleDateInput,
  fromMonthKey: string,
  horizonMonths = SCHEDULE_HORIZON_MONTHS,
): string[] {
  const [fy, fm] = fromMonthKey.split("-").map(Number);
  const [sy, sm] = rule.start_date.slice(0, 7).split("-").map(Number);
  const interval = Math.max(1, rule.interval_months || 1);
  const dates: string[] = [];

  for (let i = 0; i < horizonMonths; i++) {
    const cursor = addMonths(new Date(fy, fm - 1, 1), i);
    const monthsFromStart =
      (cursor.getFullYear() - sy) * 12 + (cursor.getMonth() - (sm - 1));
    if (monthsFromStart < 0) continue;
    if (monthsFromStart % interval !== 0) continue;
    const date = dateOnDay(
      cursor.getFullYear(),
      cursor.getMonth(),
      rule.day_of_month,
    );
    if (date < rule.start_date) continue;
    if (rule.end_date && date > rule.end_date) continue;
    dates.push(date);
  }
  return dates;
}

/** monthKey（yyyy-MM）に、その取引の発生日が1日でもあるか。 */
export function ruleOccursInMonth(
  rule: ScheduleDateInput,
  monthKey: string,
): boolean {
  return scheduleOccurrenceDates(rule, monthKey, 1).some((date) =>
    date.startsWith(monthKey),
  );
}

/** 生成を始める月。開始が未来ならその月、そうでなければ今月。過去月は埋めない。 */
export function scheduleWindowStart(startDate: string, today = new Date()): string {
  const todayMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const startMonth = startDate.slice(0, 7);
  return startMonth > todayMonth ? startMonth : todayMonth;
}
