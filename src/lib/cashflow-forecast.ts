import { scheduleOccurrenceDates } from "@/lib/schedule-dates";
import type { PayPeriod } from "@/lib/pay-period";
import {
  isPocketSpendCategory,
  isTransportCategory,
  type ScheduledRule,
} from "@/lib/types";

export const CASHFLOW_AICHI_BANK = "あいち銀行";
export const CASHFLOW_DOCOMO_BANK = "ドコモ銀行";
export const DEFAULT_SALARY_RETAIN = 60_000;
export const DEFAULT_AICHI_OPENING = 75_599;
export const DEFAULT_DOCOMO_OPENING = 27_093;

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

export type CashflowBankColumn = {
  opening: number;
  salary: number;
  otherIncome: number;
  expense: number;
  adjustment: number;
  ending: number;
};

export type CashflowOutsideItem = {
  item: string;
  amount: number;
  accountName: string;
};

export type CashflowRow = {
  period: PayPeriod;
  /** 開始残高を置いた期間より前は、銀行の見通しを出さない */
  tracked: boolean;
  /** この期間の給料のうち、あいち銀行へ残す設定額 */
  salaryRetain: number;
  salaryRetainCustom: boolean;
  salaryTotal: number;
  adIncome: number;
  aichi: CashflowBankColumn;
  docomo: CashflowBankColumn;
  custom: boolean;
  phase: "past" | "now" | "future";
  items: CashflowAuditLine[];
  /** どちらの銀行でもない取引登録。日々の支出と交通費は含めない */
  outside: CashflowOutsideItem[];
};

export type CashflowBankPeriod = {
  periodStart: string;
  salaryRetain: number | null;
  aichiAdjustment: number;
  docomoAdjustment: number;
};

export type CashflowBankSettings = {
  openingPeriodStart: string;
  aichiOpening: number;
  docomoOpening: number;
  salaryRetain: number;
  periods: CashflowBankPeriod[];
};

/** これより前の入出金は旧履歴。キャッシュフローには入れない。 */
export const CASHFLOW_HISTORY_CUTOFF = "2026-10-30";

function inRange(date: string, start: string, end: string): boolean {
  return date >= start && date <= end;
}

function emptyBank(opening = 0): CashflowBankColumn {
  return { opening, salary: 0, otherIncome: 0, expense: 0, adjustment: 0, ending: opening };
}

function bankEnding(bank: Omit<CashflowBankColumn, "ending">, adIncome: number): number {
  return bank.opening + bank.salary + adIncome + bank.otherIncome - bank.expense + bank.adjustment;
}

export function buildCashflowRows(input: {
  today: string;
  periods: PayPeriod[];
  events: CashflowEvent[];
  rules: ScheduledRule[];
  skips: { scheduled_rule_id: string; date: string }[];
  accounts: { id: string; name: string }[];
  categories?: { id: string; name: string }[];
  banks: CashflowBankSettings;
  /** 確認用エクセルの明細。画面には出さない */
  audit?: { lines: CashflowAuditLine[] };
}): CashflowRow[] {
  const ruleNames = new Map(input.rules.map((rule) => [rule.id, rule.name]));
  const categoryNames = new Map((input.categories ?? []).map((category) => [category.id, category.name]));
  const accountNames = new Map(input.accounts.map((account) => [account.id, account.name]));
  const aichiIds = new Set(
    input.accounts.filter((account) => account.name === CASHFLOW_AICHI_BANK).map((account) => account.id),
  );
  const docomoIds = new Set(
    input.accounts.filter((account) => account.name === CASHFLOW_DOCOMO_BANK).map((account) => account.id),
  );
  const periodSettings = new Map(input.banks.periods.map((period) => [period.periodStart, period]));
  const events = eventsForForecast(input, ruleNames, categoryNames);
  let aichiOpening = input.banks.aichiOpening;
  let docomoOpening = input.banks.docomoOpening;
  let rolling = false;

  return input.periods.map((period) => {
    const phase: CashflowRow["phase"] =
      period.end < input.today ? "past" : period.start > input.today ? "future" : "now";
    if (period.start < input.banks.openingPeriodStart) {
      return {
        period,
        tracked: false,
        salaryRetain: input.banks.salaryRetain,
        salaryRetainCustom: false,
        salaryTotal: 0,
        adIncome: 0,
        aichi: emptyBank(),
        docomo: emptyBank(),
        custom: false,
        phase,
        items: [],
        outside: [],
      };
    }
    const openingAichi = rolling ? aichiOpening : input.banks.aichiOpening;
    const openingDocomo = rolling ? docomoOpening : input.banks.docomoOpening;
    rolling = true;
    const settings = periodSettings.get(period.start);
    const salaryRetain = settings?.salaryRetain ?? input.banks.salaryRetain;
    const row = buildPeriodRow({
      period,
      phase,
      events,
      ruleNames,
      accountNames,
      aichiIds,
      docomoIds,
      openingAichi,
      openingDocomo,
      salaryRetain,
      salaryRetainCustom: settings?.salaryRetain != null,
      aichiAdjustment: settings?.aichiAdjustment ?? 0,
      docomoAdjustment: settings?.docomoAdjustment ?? 0,
    });
    aichiOpening = row.aichi.ending;
    docomoOpening = row.docomo.ending;
    if (input.audit) input.audit.lines.push(...row.items);
    return row;
  });
}

function eventsForForecast(
  input: {
    events: CashflowEvent[];
    rules: ScheduledRule[];
    skips: { scheduled_rule_id: string; date: string }[];
    banks: CashflowBankSettings;
  },
  ruleNames: Map<string, string>,
  categoryNames: Map<string, string>,
): CashflowEvent[] {
  const have = new Set(
    input.events
      .filter((event) => event.scheduledRuleId)
      .map((event) => `${event.scheduledRuleId}|${event.date}`),
  );
  const skipSet = new Set(
    input.skips.map((row) => `${row.scheduled_rule_id}|${String(row.date).slice(0, 10)}`),
  );
  const synthetic: CashflowEvent[] = [];
  const horizonStart = input.banks.openingPeriodStart.slice(0, 7);
  for (const rule of input.rules) {
    for (const date of scheduleOccurrenceDates(rule, horizonStart, 40)) {
      const key = `${rule.id}|${date}`;
      if (have.has(key) || skipSet.has(key) || date < CASHFLOW_HISTORY_CUTOFF) continue;
      if (date < input.banks.openingPeriodStart) continue;
      synthetic.push({
        date,
        amount: rule.amount,
        kind: rule.flow === "income" ? "income" : "expense",
        categoryName: rule.category_id ? categoryNames.get(rule.category_id) ?? null : null,
        scheduledRuleId: rule.id,
        accountId: rule.asset_account_id,
        label: ruleNames.get(rule.id) ?? rule.name,
      });
    }
  }
  return [...input.events, ...synthetic];
}

function buildPeriodRow(input: {
  period: PayPeriod;
  phase: CashflowRow["phase"];
  events: CashflowEvent[];
  ruleNames: Map<string, string>;
  accountNames: Map<string, string>;
  aichiIds: Set<string>;
  docomoIds: Set<string>;
  openingAichi: number;
  openingDocomo: number;
  salaryRetain: number;
  salaryRetainCustom: boolean;
  aichiAdjustment: number;
  docomoAdjustment: number;
}): CashflowRow {
  const items: CashflowAuditLine[] = [];
  const outside: CashflowOutsideItem[] = [];
  let salaryTotal = 0;
  let salaryDate: string | null = null;
  let adIncome = 0;
  const aichi = emptyBank(input.openingAichi);
  const docomo = emptyBank(input.openingDocomo);
  aichi.adjustment = input.aichiAdjustment;
  docomo.adjustment = input.docomoAdjustment;

  for (const event of input.events) {
    if (event.date < CASHFLOW_HISTORY_CUTOFF) continue;
    if (!inRange(event.date, input.period.start, input.period.end)) continue;
    const name = eventName(event, input.ruleNames);
    if (isDailySpend(event)) continue;
    if (event.kind === "income" && incomeKind(name) === "salary") {
      salaryTotal += event.amount;
      if (salaryDate == null || event.date < salaryDate) salaryDate = event.date;
      continue;
    }
    if (event.kind === "income" && incomeKind(name) === "ad") {
      adIncome += event.amount;
      items.push(line(input.period, event.date, CASHFLOW_AICHI_BANK, "広告収入", name, event.amount));
      continue;
    }
    const bank = bankOf(event.accountId, input.aichiIds, input.docomoIds);
    if (!bank) {
      if (event.scheduledRuleId) {
        outside.push({
          item: name,
          amount: event.kind === "income" ? event.amount : -event.amount,
          accountName: accountLabel(event.accountId, input.accountNames),
        });
      }
      continue;
    }
    const accountName = bank === "aichi" ? CASHFLOW_AICHI_BANK : CASHFLOW_DOCOMO_BANK;
    const column = bank === "aichi" ? aichi : docomo;
    if (event.kind === "income") {
      column.otherIncome += event.amount;
      items.push(line(input.period, event.date, accountName, "その他収入", name, event.amount));
      continue;
    }
    column.expense += event.amount;
    items.push(
      line(
        input.period,
        event.date,
        accountName,
        event.scheduledRuleId ? "固定費" : "その他支出",
        name,
        -event.amount,
      ),
    );
  }

  const retain = Math.min(Math.max(0, input.salaryRetain), salaryTotal);
  const salaryToDocomo = salaryTotal - retain;
  aichi.salary = retain;
  docomo.salary = salaryToDocomo;
  const paidOn = salaryDate ?? input.period.start;
  if (salaryToDocomo !== 0) {
    items.unshift(line(input.period, paidOn, CASHFLOW_DOCOMO_BANK, "給料", "給料", salaryToDocomo));
  }
  if (retain !== 0) {
    items.unshift(line(input.period, paidOn, CASHFLOW_AICHI_BANK, "給料", "給料", retain));
  }
  if (aichi.adjustment !== 0) {
    items.push(line(input.period, input.period.end, CASHFLOW_AICHI_BANK, "調整", "調整", aichi.adjustment));
  }
  if (docomo.adjustment !== 0) {
    items.push(line(input.period, input.period.end, CASHFLOW_DOCOMO_BANK, "調整", "調整", docomo.adjustment));
  }
  aichi.ending = bankEnding(aichi, adIncome);
  docomo.ending = bankEnding(docomo, 0);
  return {
    period: input.period,
    tracked: true,
    salaryRetain: input.salaryRetain,
    salaryRetainCustom: input.salaryRetainCustom,
    salaryTotal,
    adIncome,
    aichi,
    docomo,
    custom: input.salaryRetainCustom || aichi.adjustment !== 0 || docomo.adjustment !== 0,
    phase: input.phase,
    items,
    outside,
  };
}

function line(
  period: PayPeriod,
  date: string,
  accountName: string,
  kind: CashflowAuditKind,
  item: string,
  amount: number,
): CashflowAuditLine {
  return {
    periodStart: period.start,
    periodEnd: period.end,
    date,
    accountName,
    kind,
    item,
    amount,
  };
}

function eventName(event: CashflowEvent, ruleNames: Map<string, string>): string {
  const rule = event.scheduledRuleId ? ruleNames.get(event.scheduledRuleId) : undefined;
  const memo = event.label?.trim();
  if (rule && memo && memo !== rule) return `${rule} ${memo}`;
  return rule || memo || event.categoryName?.trim() || (event.kind === "income" ? "収入" : "支出");
}

function incomeKind(name: string): "salary" | "ad" | "other" {
  if (/給与|給料/.test(name)) return "salary";
  if (name.includes("広告")) return "ad";
  return "other";
}

function isDailySpend(event: CashflowEvent): boolean {
  const name = event.categoryName?.trim();
  if (!name) return false;
  return isPocketSpendCategory(name) || isTransportCategory(name);
}

function bankOf(
  accountId: string | null,
  aichiIds: Set<string>,
  docomoIds: Set<string>,
): "aichi" | "docomo" | null {
  if (!accountId) return null;
  if (aichiIds.has(accountId)) return "aichi";
  if (docomoIds.has(accountId)) return "docomo";
  return null;
}

function accountLabel(accountId: string | null, accountNames: Map<string, string>): string {
  if (!accountId) return "口座なし";
  return accountNames.get(accountId) ?? "不明な口座";
}
