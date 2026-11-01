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
  accountId: string | null;
};

export type CashflowAccountLine = {
  name: string;
  now: number;
  change: number;
  ending: number;
  savings: boolean;
};

export type CashflowEndingBreakdown = {
  accounts: CashflowAccountLine[];
  unassigned: number;
  daily: number;
  transport: number;
  adjustment: number;
  total: number;
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
  /** past は起点以降で、すでに終わった期間。期首と期末は出さない。 */
  phase: "past" | "now" | "future";
  breakdown: CashflowEndingBreakdown | null;
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
  accounts: { id: string; name: string; balance: number; savings: boolean }[];
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
        accountId: rule.asset_account_id,
      });
    }
  }
  const events = [...input.events, ...synthetic];
  let opening = input.opening;
  let cumDaily = 0;
  let cumTransport = 0;
  let cumAdjustment = 0;
  return input.periods.map((period) => {
    const custom = overrideByStart.get(period.start);
    const plan = custom ?? input.base;
    const phase: CashflowRow["phase"] =
      period.end < input.today ? "past" : period.start > input.today ? "future" : "now";
    const from = phase === "now" ? addDays(input.today, 1) : period.start;
    let income = 0;
    let scheduledExpense = 0;
    let extraExpense = 0;
    let spentPocket = 0;
    let spentTransport = 0;
    for (const event of events) {
      if (event.date < CASHFLOW_HISTORY_CUTOFF) continue;
      if (phase === "past" && event.date > input.today) continue;
      if (!inRange(event.date, from, period.end)) continue;
      if (event.kind === "income") {
        income += event.amount;
        continue;
      }
      const pocket =
        event.categoryName != null && isPocketSpendCategory(event.categoryName);
      const transport =
        event.categoryName != null && isTransportCategory(event.categoryName);
      if (phase === "past" && pocket) {
        spentPocket += event.amount;
        continue;
      }
      if (phase === "past" && transport) {
        spentTransport += event.amount;
        continue;
      }
      if (event.scheduledRuleId) {
        scheduledExpense += event.amount;
        continue;
      }
      if (pocket || transport) continue;
      extraExpense += event.amount;
    }
    if (phase === "past") {
      return {
        period,
        opening: 0,
        income,
        scheduledExpense: scheduledExpense + extraExpense,
        daily: spentPocket,
        transport: spentTransport,
        adjustment: 0,
        planDaily: plan.daily,
        planTransport: plan.transport,
        planAdjustment: plan.adjustment,
        ending: 0,
        custom: Boolean(custom),
        phase,
        breakdown: null,
      };
    }
    let daily = plan.daily;
    let transport = plan.transport;
    if (phase === "now") {
      daily = Math.max(0, plan.daily - input.spentDaily);
      transport = Math.max(0, plan.transport - input.spentTransport);
    }
    const ending =
      opening + income - scheduledExpense - extraExpense - daily - transport - plan.adjustment;
    cumDaily += daily;
    cumTransport += transport;
    cumAdjustment += plan.adjustment;
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
      phase,
      breakdown: endingBreakdown(
        input.accounts,
        events,
        input.today,
        period.end,
        cumDaily,
        cumTransport,
        cumAdjustment,
      ),
    };
    opening = ending;
    return row;
  });
}

function endingBreakdown(
  accounts: { id: string; name: string; balance: number; savings: boolean }[],
  events: CashflowEvent[],
  today: string,
  through: string,
  daily: number,
  transport: number,
  adjustment: number,
): CashflowEndingBreakdown {
  const change = new Map<string, number>();
  let unassigned = 0;
  for (const event of events) {
    if (event.date <= today || event.date > through) continue;
    if (event.date < CASHFLOW_HISTORY_CUTOFF) continue;
    const pocket =
      event.categoryName != null && isPocketSpendCategory(event.categoryName);
    const transportCategory =
      event.categoryName != null && isTransportCategory(event.categoryName);
    let delta = 0;
    if (event.kind === "income") delta = event.amount;
    else if (event.scheduledRuleId) delta = -event.amount;
    else if (pocket || transportCategory) continue;
    else delta = -event.amount;
    if (!event.accountId) unassigned += delta;
    else change.set(event.accountId, (change.get(event.accountId) ?? 0) + delta);
  }
  const lines = accounts.map((account) => {
    const moved = change.get(account.id) ?? 0;
    change.delete(account.id);
    return {
      name: account.name,
      now: account.balance,
      change: moved,
      ending: account.balance + moved,
      savings: account.savings,
    };
  });
  for (const [id, moved] of change) {
    lines.push({
      name: id,
      now: 0,
      change: moved,
      ending: moved,
      savings: false,
    });
  }
  const accountTotal = lines.reduce((sum, line) => sum + line.ending, 0) + unassigned;
  return {
    accounts: lines,
    unassigned,
    daily,
    transport,
    adjustment,
    total: accountTotal - daily - transport - adjustment,
  };
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
