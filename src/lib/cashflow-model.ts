import "server-only";

import {
  CASHFLOW_HISTORY_CUTOFF,
  DEFAULT_AICHI_OPENING,
  DEFAULT_DOCOMO_OPENING,
  DEFAULT_SALARY_RETAIN,
  type CashflowBankSettings,
  type CashflowEvent,
} from "@/lib/cashflow-forecast";
import {
  ensureDailySpendCategories,
  fetchAssetAccounts,
  fetchCashflowPlan,
  fetchDailySpendEntriesInRange,
  fetchScheduledRules,
  fetchScheduledRuleSkips,
  prepareDailySpendSchedules,
} from "@/lib/data";
import { todayKeyInTimeZone } from "@/lib/dates";
import { payPeriodsFrom } from "@/lib/pay-period";

export async function loadCashflowModel() {
  const today = todayKeyInTimeZone();
  const anchor = today < CASHFLOW_HISTORY_CUTOFF ? CASHFLOW_HISTORY_CUTOFF : today;
  const ahead = payPeriodsFrom(anchor, 36);
  const lastStart = ahead[ahead.length - 1]?.start ?? anchor;
  const periods = payPeriodsFrom(CASHFLOW_HISTORY_CUTOFF, 120).filter(
    (period) => period.start <= lastStart,
  );
  const [categories, accounts] = await Promise.all([
    ensureDailySpendCategories(),
    fetchAssetAccounts(),
  ]);
  await prepareDailySpendSchedules(categories, accounts);
  const [rules, occurrences, skips, plan] = await Promise.all([
    fetchScheduledRules(),
    fetchDailySpendEntriesInRange(
      periods[0].start < CASHFLOW_HISTORY_CUTOFF
        ? CASHFLOW_HISTORY_CUTOFF
        : periods[0].start,
      periods[periods.length - 1].end,
    ),
    fetchScheduledRuleSkips(),
    fetchCashflowPlan(),
  ]);
  const categoryName = new Map(categories.map((category) => [category.id, category.name]));
  const events: CashflowEvent[] = occurrences.map((entry) => {
    const name = entry.category_id ? categoryName.get(entry.category_id) ?? null : null;
    return {
      date: entry.date.slice(0, 10),
      amount: entry.amount,
      kind: entry.kind === "income" ? "income" : "expense",
      categoryName: name,
      scheduledRuleId: entry.scheduled_rule_id ?? null,
      accountId: entry.asset_account_id ?? null,
      label: entry.memo,
    };
  });
  const banks: CashflowBankSettings = {
    openingPeriodStart: String(plan.base?.opening_period_start ?? CASHFLOW_HISTORY_CUTOFF).slice(0, 10),
    aichiOpening: plan.base?.aichi_opening ?? DEFAULT_AICHI_OPENING,
    docomoOpening: plan.base?.docomo_opening ?? DEFAULT_DOCOMO_OPENING,
    salaryRetain: plan.base?.salary_retain ?? DEFAULT_SALARY_RETAIN,
    periods: plan.periods.map((row) => ({
      periodStart: String(row.period_start).slice(0, 10),
      salaryRetain: row.salary_retain ?? null,
      aichiAdjustment: row.aichi_adjustment ?? 0,
      docomoAdjustment: row.docomo_adjustment ?? 0,
    })),
  };
  const accountSeeds = accounts
    .filter((account) => !account.archived)
    .map((account) => ({
      id: account.id,
      name: account.name,
    }));
  const allocationError = plan.error?.includes("023_cashflow_allocations")
    ? plan.error
    : plan.error?.includes("cashflow_income_allocation") || plan.error?.includes("daily_account_id")
      ? "収入の割り振りには supabase/migrations/023_cashflow_allocations.sql の実行が必要です"
      : null;
  const loadError =
    allocationError ??
    (plan.error?.includes("cashflow_plan")
      ? "キャッシュフローの保存には supabase/migrations/021_cashflow_plan.sql の実行が必要です"
      : plan.error);
  return {
    today,
    savedBase: plan.base?.aichi_opening != null && plan.base?.docomo_opening != null,
    accounts: accountSeeds,
    banks,
    loadError,
    forecast: {
      today,
      periods,
      events,
      rules,
      skips,
      accounts: accountSeeds,
      categories: categories.map((category) => ({ id: category.id, name: category.name })),
      banks,
    },
  };
}
