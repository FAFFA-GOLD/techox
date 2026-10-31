import { CashflowClient } from "@/components/cashflow-client";
import { buildAccountBalanceViews } from "@/lib/account-display";
import {
  buildCashflowRows,
  CASHFLOW_HISTORY_CUTOFF,
  defaultCashflowPlan,
  type CashflowEvent,
} from "@/lib/cashflow-forecast";
import {
  fetchAccountBalanceSnapshots,
  fetchAssetAccounts,
  fetchBalanceMovementsSince,
  fetchCashflowPlan,
  ensureDailySpendCategories,
  fetchScheduledRules,
  fetchScheduledRuleSkips,
  fetchDailySpendEntriesInRange,
  prepareDailySpendSchedules,
} from "@/lib/data";
import { todayKeyInTimeZone } from "@/lib/dates";
import { payPeriodsFrom } from "@/lib/pay-period";
import { isPocketSpendCategory, isSavingsAccountName, isTransportCategory } from "@/lib/types";

export default async function ForecastPage() {
  const today = todayKeyInTimeZone();
  const periods = payPeriodsFrom(today, 36);
  const [categories, accounts] = await Promise.all([
    ensureDailySpendCategories(),
    fetchAssetAccounts(),
  ]);
  await prepareDailySpendSchedules(categories, accounts);
  const snapshots = await fetchAccountBalanceSnapshots();
  const asOfDates = snapshots
    .filter((snap) => snap.as_of_date <= today)
    .map((snap) => snap.as_of_date)
    .sort();
  const earliest = asOfDates[0];
  const [movements, rules, occurrences, skips, plan] = await Promise.all([
    earliest ? fetchBalanceMovementsSince(earliest, today) : Promise.resolve([]),
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
  const balances = buildAccountBalanceViews(accounts, snapshots, movements, today);
  const known = balances.filter((row) => row.balance != null);
  const opening = known.reduce((sum, row) => sum + (row.balance ?? 0), 0);
  const savings = known
    .filter((row) => isSavingsAccountName(row.name))
    .reduce((sum, row) => sum + (row.balance ?? 0), 0);
  const categoryName = new Map(categories.map((category) => [category.id, category.name]));
  const current = periods[0];
  let spentDaily = 0;
  let spentTransport = 0;
  const events: CashflowEvent[] = occurrences.map((entry) => {
    const name = entry.category_id ? categoryName.get(entry.category_id) ?? null : null;
    if (
      current &&
      entry.date >= CASHFLOW_HISTORY_CUTOFF &&
      entry.date >= current.start &&
      entry.date <= today &&
      entry.kind !== "income"
    ) {
      if (name && isPocketSpendCategory(name)) spentDaily += entry.amount;
      if (name && isTransportCategory(name)) spentTransport += entry.amount;
    }
    return {
      date: entry.date.slice(0, 10),
      amount: entry.amount,
      kind: entry.kind === "income" ? "income" : "expense",
      categoryName: name,
      scheduledRuleId: entry.scheduled_rule_id ?? null,
    };
  });
  const fallback = defaultCashflowPlan(categories, today.slice(0, 7));
  const base = plan.base
    ? {
        daily: plan.base.daily_budget,
        transport: plan.base.transport_budget,
        adjustment: plan.base.adjustment,
      }
    : fallback;
  const rows = buildCashflowRows({
    today,
    periods,
    opening,
    events,
    rules,
    skips,
    base,
    overrides: plan.periods.map((row) => ({
      periodStart: String(row.period_start).slice(0, 10),
      amounts: {
        daily: row.daily_budget,
        transport: row.transport_budget,
        adjustment: row.adjustment,
      },
    })),
    spentDaily,
    spentTransport,
  });
  return (
    <CashflowClient
      rows={rows}
      savings={savings}
      base={base}
      savedBase={Boolean(plan.base)}
      loadError={
        plan.error
          ? "キャッシュフローの保存には supabase/migrations/021_cashflow_plan.sql の実行が必要です"
          : null
      }
    />
  );
}
