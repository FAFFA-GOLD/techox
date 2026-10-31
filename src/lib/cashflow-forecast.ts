import { scheduleOccurrenceDates } from "@/lib/schedule-dates";
import type { PayPeriod } from "@/lib/pay-period";
import {
  isPocketSpendCategory,
  isTransportCategory,
  resolveCategoryBudget,
  type DailySpendCategory,
  type ScheduledRule,
} from "@/lib/types";

export type CashflowPlanAmounts = {
  daily: number;
  transport: number;
  adjustment: number;
};

export type CashflowEvent = {
  date: string;
  amount: number;
  kind: "income" | "expense";
  categoryName: string | null;
  scheduledRuleId: string | null;
};

export type CashflowRow = {
  period: PayPeriod;
  opening: number;
  income: number;
  scheduledExpense: number;
  daily: number;
  transport: number;
  adjustment: number;
  planDaily: number;
  planTransport: number;
  planAdjustment: number;
  ending: number;
  custom: boolean;
};

function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const cursor = new Date(Date.UTC(year, month - 1, day + days));
  return `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}-${String(cursor.getUTCDate()).padStart(2, "0")}`;
}

/** これより前の入出金は旧履歴。キャッシュフローには入れない。 */
export const CASHFLOW_HISTORY_CUTOFF = "2026-10-30";

function inRange(date: string, start: string, end: string): boolean {
  return date >= start && date <= end;
}

export function buildCashflowRows(input: {
  today: string;
  periods: PayPeriod[];
  opening: number;
  events: CashflowEvent[];
  rules: ScheduledRule[];
  skips: { scheduled_rule_id: string; date: string }[];
  base: CashflowPlanAmounts;
  overrides: { periodStart: string; amounts: CashflowPlanAmounts }[];
  spentDaily: number;
  spentTransport: number;
}): CashflowRow[] {
  const overrideByStart = new Map(
    input.overrides.map((row) => [row.periodStart, row.amounts]),
  );
  const have = new Set(
    input.events
      .filter((event) => event.scheduledRuleId)
      .map((event) => `${event.scheduledRuleId}|${event.date}`),
  );
  const skipSet = new Set(
    input.skips.map((row) => `${row.scheduled_rule_id}|${String(row.date).slice(0, 10)}`),
  );
  const synthetic: CashflowEvent[] = [];
  const horizonStart = input.today.slice(0, 7);
  for (const rule of input.rules) {
    for (const date of scheduleOccurrenceDates(rule, horizonStart, 40)) {
      const key = `${rule.id}|${date}`;
      if (have.has(key) || skipSet.has(key) || date <= input.today) continue;
      if (date < CASHFLOW_HISTORY_CUTOFF) continue;
      synthetic.push({
        date,
        amount: rule.amount,
        kind: rule.flow === "income" ? "income" : "expense",
        categoryName: null,
        scheduledRuleId: rule.id,
      });
    }
  }
  const events = [...input.events, ...synthetic];
  let opening = input.opening;
  return input.periods.map((period, index) => {
    const custom = overrideByStart.get(period.start);
    const plan = custom ?? input.base;
    const from = index === 0 ? addDays(input.today, 1) : period.start;
    let income = 0;
    let scheduledExpense = 0;
    let extraExpense = 0;
    for (const event of events) {
      if (event.date < CASHFLOW_HISTORY_CUTOFF) continue;
      if (!inRange(event.date, from, period.end)) continue;
      if (event.kind === "income") {
        income += event.amount;
        continue;
      }
      if (event.scheduledRuleId) {
        scheduledExpense += event.amount;
        continue;
      }
      if (
        event.categoryName &&
        (isPocketSpendCategory(event.categoryName) ||
          isTransportCategory(event.categoryName))
      ) {
        continue;
      }
      extraExpense += event.amount;
    }
    let daily = plan.daily;
    let transport = plan.transport;
    if (index === 0) {
      daily = Math.max(0, plan.daily - input.spentDaily);
      transport = Math.max(0, plan.transport - input.spentTransport);
    }
    const ending =
      opening + income - scheduledExpense - extraExpense - daily - transport - plan.adjustment;
    const row: CashflowRow = {
      period,
      opening,
      income,
      scheduledExpense: scheduledExpense + extraExpense,
      daily,
      transport,
      adjustment: plan.adjustment,
      planDaily: plan.daily,
      planTransport: plan.transport,
      planAdjustment: plan.adjustment,
      ending,
      custom: Boolean(custom),
    };
    opening = ending;
    return row;
  });
}

export function defaultCashflowPlan(
  categories: DailySpendCategory[],
  monthKey: string,
): CashflowPlanAmounts {
  const daily = categories
    .filter((category) =>
      (["家族", "昼食", "雑費"] as const).includes(
        category.name as "家族" | "昼食" | "雑費",
      ),
    )
    .reduce(
      (sum, category) =>
        sum + resolveCategoryBudget(category.name, monthKey, category.monthly_budget),
      0,
    );
  const transportCategory = categories.find((category) =>
    isTransportCategory(category.name),
  );
  const transport = transportCategory
    ? resolveCategoryBudget(
        transportCategory.name,
        monthKey,
        transportCategory.monthly_budget,
      )
    : 0;
  return { daily, transport, adjustment: 0 };
}
