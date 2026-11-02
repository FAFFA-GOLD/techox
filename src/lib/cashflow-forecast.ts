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
  dailyAccountId?: string | null;
  transportAccountId?: string | null;
};

export type CashflowAllocation = {
  ruleId: string;
  accountId: string;
  amount: number;
};

export type CashflowPeriodAllocation = CashflowAllocation & {
  periodStart: string;
};

export type CashflowAccountSeed = {
  id: string;
  name: string;
  balance: number;
  savings: boolean;
};

export type CashflowIncomeSlice = {
  ruleId: string;
  amount: number;
};

export type CashflowEvent = {
  date: string;
  amount: number;
  kind: "income" | "expense";
  categoryName: string | null;
  scheduledRuleId: string | null;
  accountId: string | null;
  /** 確認表に出す名前。メモ、取引名、用途の順で入る */
  label?: string | null;
};

export type CashflowAuditKind =
  | "給料"
  | "広告収入"
  | "その他収入"
  | "固定費"
  | "その他支出"
  | "デイリー"
  | "交通費"
  | "調整";

export type CashflowAuditLine = {
  periodStart: string;
  periodEnd: string;
  date: string;
  accountName: string;
  kind: CashflowAuditKind;
  item: string;
  amount: number;
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
  /** 生活費・交通費・調整を部門か未割り振りへ入れたあとの内訳 */
  budgetsApplied?: boolean;
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
  /** この期間に見通しへ入れる収入。割り振りの対象 */
  incomes: CashflowIncomeSlice[];
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
  accounts: CashflowAccountSeed[];
  allocations?: CashflowAllocation[];
  periodAllocations?: CashflowPeriodAllocation[];
  dailyAccountId?: string | null;
  transportAccountId?: string | null;
  /** 確認用エクセルの明細。画面には出さない */
  audit?: { lines: CashflowAuditLine[] };
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
        label: rule.name,
      });
    }
  }
  const events = [...input.events, ...synthetic];
  const ruleNames = new Map(input.rules.map((rule) => [rule.id, rule.name]));
  let opening = input.opening;
  let cumDaily = 0;
  let cumTransport = 0;
  let cumAdjustment = 0;
  const allocationIndex = indexAllocations(input.allocations ?? [], input.periodAllocations ?? []);
  const useDepartments = allocationIndex.active || Boolean(input.dailyAccountId || input.transportAccountId);
  const running = new Map(input.accounts.map((account) => [account.id, account.balance]));
  let runningUnassigned = 0;
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
    const incomeByRule = new Map<string, number>();
    const plainIncome: MoneyHit[] = [];
    const ruledIncome = new Map<string, MoneyHit[]>();
    const expenseHits: MoneyHit[] = [];
    for (const event of events) {
      if (event.date < CASHFLOW_HISTORY_CUTOFF) continue;
      if (phase === "past" && event.date > input.today) continue;
      if (!inRange(event.date, from, period.end)) continue;
      const hit: MoneyHit = {
        accountId: event.accountId,
        amount: event.amount,
        date: event.date,
        item: eventLabel(event, ruleNames),
        categoryName: event.categoryName,
        scheduled: Boolean(event.scheduledRuleId),
      };
      if (event.kind === "income") {
        income += event.amount;
        if (event.scheduledRuleId) {
          incomeByRule.set(
            event.scheduledRuleId,
            (incomeByRule.get(event.scheduledRuleId) ?? 0) + event.amount,
          );
          const list = ruledIncome.get(event.scheduledRuleId) ?? [];
          list.push(hit);
          ruledIncome.set(event.scheduledRuleId, list);
        } else {
          plainIncome.push(hit);
        }
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
        expenseHits.push(hit);
        continue;
      }
      if (pocket || transport) continue;
      extraExpense += event.amount;
      expenseHits.push(hit);
    }
    const incomes = [...incomeByRule.entries()].map(([ruleId, amount]) => ({ ruleId, amount }));
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
        incomes,
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
    const deltas =
      useDepartments || input.audit
        ? collectPeriodDeltas({
            plainIncome,
            ruledIncome,
            expenseHits,
            allocationIndex,
            periodStart: period.start,
            daily,
            transport,
            adjustment: plan.adjustment,
            dailyAccountId: input.dailyAccountId ?? null,
            transportAccountId: input.transportAccountId ?? null,
            ruleNames,
            applyAllocations: useDepartments,
          })
        : [];
    if (input.audit) {
      for (const delta of deltas) {
        input.audit.lines.push({
          periodStart: period.start,
          periodEnd: period.end,
          date: delta.date,
          accountName: accountNameOf(input.accounts, delta.accountId),
          kind: delta.kind,
          item: delta.item,
          amount: delta.amount,
        });
      }
    }
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
      breakdown: useDepartments
        ? rollDepartments({
            accounts: input.accounts,
            running,
            unassigned: runningUnassigned,
            deltas,
            daily,
            transport,
            dailyAccountId: input.dailyAccountId ?? null,
            transportAccountId: input.transportAccountId ?? null,
          })
        : endingBreakdown(
            input.accounts,
            events,
            input.today,
            period.end,
            cumDaily,
            cumTransport,
            cumAdjustment,
          ),
      incomes,
    };
    if (useDepartments && row.breakdown) runningUnassigned = row.breakdown.unassigned;
    opening = ending;
    return row;
  });
}

function indexAllocations(
  base: CashflowAllocation[],
  periods: CashflowPeriodAllocation[],
): {
  active: boolean;
  base: Map<string, Map<string, number>>;
  periods: Map<string, Map<string, number>>;
} {
  const baseMap = new Map<string, Map<string, number>>();
  for (const row of base) {
    if (row.amount <= 0) continue;
    const accounts = baseMap.get(row.ruleId) ?? new Map<string, number>();
    accounts.set(row.accountId, row.amount);
    baseMap.set(row.ruleId, accounts);
  }
  const periodMap = new Map<string, Map<string, number>>();
  for (const row of periods) {
    if (row.amount <= 0) continue;
    const key = `${row.periodStart}|${row.ruleId}`;
    const accounts = periodMap.get(key) ?? new Map<string, number>();
    accounts.set(row.accountId, row.amount);
    periodMap.set(key, accounts);
  }
  return { active: baseMap.size > 0 || periodMap.size > 0, base: baseMap, periods: periodMap };
}

type MoneyHit = {
  accountId: string | null;
  amount: number;
  date: string;
  item: string;
  categoryName: string | null;
  scheduled: boolean;
};

type PeriodDelta = {
  accountId: string | null;
  amount: number;
  date: string;
  item: string;
  kind: CashflowAuditKind;
};

function eventLabel(event: CashflowEvent, ruleNames: Map<string, string>): string {
  const rule = event.scheduledRuleId ? ruleNames.get(event.scheduledRuleId) : undefined;
  const memo = event.label?.trim();
  if (rule && memo && memo !== rule) return `${rule} ${memo}`;
  return rule || memo || event.categoryName?.trim() || (event.kind === "income" ? "収入" : "支出");
}

function classifyIncome(name: string): Extract<CashflowAuditKind, "給料" | "広告収入" | "その他収入"> {
  if (/給与|給料/.test(name)) return "給料";
  if (name.includes("広告")) return "広告収入";
  return "その他収入";
}

function accountNameOf(accounts: CashflowAccountSeed[], accountId: string | null): string {
  if (!accountId) return "未割り振り";
  return accounts.find((account) => account.id === accountId)?.name ?? "不明な部門";
}

function collectPeriodDeltas(input: {
  plainIncome: MoneyHit[];
  ruledIncome: Map<string, MoneyHit[]>;
  expenseHits: MoneyHit[];
  allocationIndex: ReturnType<typeof indexAllocations>;
  periodStart: string;
  daily: number;
  transport: number;
  adjustment: number;
  dailyAccountId: string | null;
  transportAccountId: string | null;
  ruleNames: Map<string, string>;
  applyAllocations: boolean;
}): PeriodDelta[] {
  const deltas: PeriodDelta[] = [];
  for (const [ruleId, parts] of input.ruledIncome) {
    const total = parts.reduce((sum, part) => sum + part.amount, 0);
    const ruleLabel = input.ruleNames.get(ruleId) ?? parts[0]?.item ?? "収入";
    const kind = classifyIncome(`${ruleLabel} ${parts[0]?.categoryName ?? ""}`);
    const allocated = input.applyAllocations
      ? input.allocationIndex.periods.get(`${input.periodStart}|${ruleId}`) ??
        input.allocationIndex.base.get(ruleId) ??
        null
      : null;
    if (!allocated) {
      for (const part of parts) {
        deltas.push({
          accountId: part.accountId,
          amount: part.amount,
          date: part.date,
          item: part.item || ruleLabel,
          kind,
        });
      }
      continue;
    }
    let assigned = 0;
    for (const [accountId, amount] of allocated) {
      deltas.push({ accountId, amount, date: "", item: ruleLabel, kind });
      assigned += amount;
    }
    if (total !== assigned) {
      deltas.push({
        accountId: null,
        amount: total - assigned,
        date: "",
        item: `${ruleLabel}の残り`,
        kind,
      });
    }
  }
  for (const part of input.plainIncome) {
    const label = part.item || part.categoryName || "収入";
    deltas.push({
      accountId: part.accountId,
      amount: part.amount,
      date: part.date,
      item: label,
      kind: classifyIncome(label),
    });
  }
  for (const hit of input.expenseHits) {
    deltas.push({
      accountId: hit.accountId,
      amount: -hit.amount,
      date: hit.date,
      item: hit.item,
      kind: hit.scheduled ? "固定費" : "その他支出",
    });
  }
  if (input.daily !== 0) {
    deltas.push({
      accountId: input.dailyAccountId,
      amount: -input.daily,
      date: "",
      item: "デイリー",
      kind: "デイリー",
    });
  }
  if (input.transport !== 0) {
    deltas.push({
      accountId: input.transportAccountId,
      amount: -input.transport,
      date: "",
      item: "交通費",
      kind: "交通費",
    });
  }
  if (input.adjustment !== 0) {
    deltas.push({
      accountId: null,
      amount: -input.adjustment,
      date: "",
      item: "調整",
      kind: "調整",
    });
  }
  return deltas;
}

function rollDepartments(input: {
  accounts: CashflowAccountSeed[];
  running: Map<string, number>;
  unassigned: number;
  deltas: PeriodDelta[];
  daily: number;
  transport: number;
  dailyAccountId: string | null;
  transportAccountId: string | null;
}): CashflowEndingBreakdown {
  const before = new Map(input.running);
  let unassigned = input.unassigned;
  for (const delta of input.deltas) {
    if (!delta.accountId) unassigned += delta.amount;
    else input.running.set(delta.accountId, (input.running.get(delta.accountId) ?? 0) + delta.amount);
  }

  const lines = input.accounts.map((account) => {
    const now = before.get(account.id) ?? 0;
    const ending = input.running.get(account.id) ?? 0;
    return {
      name: account.name,
      now,
      change: ending - now,
      ending,
      savings: account.savings,
    };
  });
  for (const [id, ending] of input.running) {
    if (input.accounts.some((account) => account.id === id)) continue;
    const now = before.get(id) ?? 0;
    lines.push({
      name: id,
      now,
      change: ending - now,
      ending,
      savings: false,
    });
  }
  const accountTotal = lines.reduce((sum, line) => sum + line.ending, 0);
  return {
    accounts: lines,
    unassigned,
    daily: input.dailyAccountId ? 0 : input.daily,
    transport: input.transportAccountId ? 0 : input.transport,
    adjustment: 0,
    total: accountTotal + unassigned,
    budgetsApplied: true,
  };
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
