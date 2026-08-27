import {
  addDays,
  addMonths,
  endOfMonth,
  format,
  isAfter,
  parseISO,
  startOfMonth,
  subDays,
} from "date-fns";
import type {
  AccountTransfer,
  BalanceSnapshot,
  CashflowRow,
  CreditCard,
  CreditCardPayment,
  Loan,
  LoanPayment,
  PeriodKey,
  PeriodRange,
  RecurringRule,
  Transaction,
  TransactionKind,
  UserSettings,
} from "./types";

export function formatYen(amount: number): string {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function signedAmount(kind: TransactionKind, amount: number): number {
  return kind === "income" ? amount : -amount;
}

export function clampDayOfMonth(year: number, monthIndex: number, day: number): number {
  const last = endOfMonth(new Date(year, monthIndex, 1)).getDate();
  return Math.min(Math.max(1, day), last);
}

export function dateOnDay(
  year: number,
  monthIndex: number,
  day: number,
): string {
  const d = clampDayOfMonth(year, monthIndex, day);
  return format(new Date(year, monthIndex, d), "yyyy-MM-dd");
}

export function defaultSettings(): UserSettings {
  return {
    user_id: "",
    payday_type: "last_day",
    payday_day: 31,
    updated_at: new Date().toISOString(),
  };
}

export function paydayInMonth(
  year: number,
  monthIndex: number,
  settings: Pick<UserSettings, "payday_type" | "payday_day">,
): string {
  if (settings.payday_type === "last_day") {
    return format(endOfMonth(new Date(year, monthIndex, 1)), "yyyy-MM-dd");
  }
  return dateOnDay(year, monthIndex, settings.payday_day);
}

export function toPeriodKey(date: Date | string): PeriodKey {
  const d = typeof date === "string" ? parseISO(date) : date;
  return format(d, "yyyy-MM") as PeriodKey;
}

export function parsePeriodKey(key: PeriodKey): { year: number; monthIndex: number } {
  const [y, m] = key.split("-").map(Number);
  return { year: y, monthIndex: m - 1 };
}

export function shiftPeriod(key: PeriodKey, delta: number): PeriodKey {
  const { year, monthIndex } = parsePeriodKey(key);
  return toPeriodKey(addMonths(new Date(year, monthIndex, 1), delta));
}

export function getPeriodRange(
  key: PeriodKey,
  settings: Pick<UserSettings, "payday_type" | "payday_day">,
): PeriodRange {
  const { year, monthIndex } = parsePeriodKey(key);
  const start = paydayInMonth(year, monthIndex, settings);
  const next = addMonths(new Date(year, monthIndex, 1), 1);
  const nextPayday = paydayInMonth(next.getFullYear(), next.getMonth(), settings);
  const end = format(subDays(parseISO(nextPayday), 1), "yyyy-MM-dd");
  const startLabel = format(parseISO(start), "M/d");
  const endLabel = format(parseISO(end), "M/d");
  return {
    key,
    start,
    end,
    payday: start,
    label: `全体家計 · ${format(parseISO(start), "yyyy年M月")}（${startLabel}〜${endLabel}）`,
  };
}

export function periodContainingDate(
  date: string,
  settings: Pick<UserSettings, "payday_type" | "payday_day">,
): PeriodRange {
  const d = parseISO(date);
  // Candidate: period of this calendar month, or previous if before this month's payday
  const thisKey = toPeriodKey(d);
  const thisPeriod = getPeriodRange(thisKey, settings);
  if (date >= thisPeriod.start && date <= thisPeriod.end) return thisPeriod;
  if (date < thisPeriod.start) {
    return getPeriodRange(shiftPeriod(thisKey, -1), settings);
  }
  return getPeriodRange(shiftPeriod(thisKey, 1), settings);
}

export function currentPeriodKey(
  settings: Pick<UserSettings, "payday_type" | "payday_day">,
  today = new Date(),
): PeriodKey {
  return periodContainingDate(format(today, "yyyy-MM-dd"), settings).key;
}

/** @deprecated alias */
export const toMonthKey = toPeriodKey;
export const shiftMonth = shiftPeriod;
export function monthLabel(key: PeriodKey): string {
  return getPeriodRange(key, defaultSettings()).label
    .replace(/^全体家計 · /, "")
    .replace(/（.*/, "");
}
export function monthRange(key: PeriodKey): { start: string; end: string } {
  const r = getPeriodRange(key, defaultSettings());
  return { start: r.start, end: r.end };
}
export function parseMonthKey(key: PeriodKey): Date {
  const { year, monthIndex } = parsePeriodKey(key);
  return new Date(year, monthIndex, 1);
}

function occurrenceDateInCalendarMonth(
  year: number,
  monthIndex: number,
  dayOfMonth: number,
): string {
  return dateOnDay(year, monthIndex, dayOfMonth);
}

function ruleActiveOnDate(rule: RecurringRule, date: string): boolean {
  if (date < rule.start_date) return false;
  if (rule.end_date && date > rule.end_date) return false;
  return true;
}

export type LedgerItem = {
  id: string;
  date: string;
  amount: number;
  kind: TransactionKind;
  memo: string | null;
  category_id: string | null;
  category_name: string | null;
  category_color: string | null;
  isProjected: boolean;
  recurring_rule_id: string | null;
  source?: "transaction" | "recurring" | "card" | "loan" | "transfer";
  asset_account_id?: string | null;
  credit_card_id?: string | null;
  one_time_amount?: number;
  installment_amount?: number;
  loan_id?: string | null;
  principal_amount?: number;
  interest_amount?: number;
  payment_id?: string | null;
  transfer_id?: string | null;
};

/** 未指定の引落口座はメイン口座（is_main）扱い */
export function resolveLedgerAccountId(
  itemAccountId: string | null | undefined,
  mainAccountId: string | null,
): string | null {
  return itemAccountId ?? mainAccountId;
}

/** 振替を出金・入金の台帳行へ展開（出金＝移動額＋手数料） */
export function transferToLedgerItems(
  transfers: AccountTransfer[],
  accountNames: Map<string, string> | Record<string, string>,
  range?: { start: string; end: string },
): LedgerItem[] {
  const nameOf = (id: string) => {
    if (accountNames instanceof Map) return accountNames.get(id) ?? "口座";
    return accountNames[id] ?? "口座";
  };
  const items: LedgerItem[] = [];
  for (const t of transfers) {
    if (range && (t.date < range.start || t.date > range.end)) continue;
    const fee = Math.max(0, t.fee_amount ?? 0);
    const outAmount = t.amount + fee;
    const toName = nameOf(t.to_asset_account_id);
    const fromName = nameOf(t.from_asset_account_id);
    items.push({
      id: `transfer-out-${t.id}`,
      date: t.date,
      amount: outAmount,
      kind: "expense",
      memo:
        fee > 0
          ? `振替 → ${toName}（手数料 ${fee.toLocaleString()} 円含む）`
          : `振替 → ${toName}`,
      category_id: null,
      category_name: "振替",
      category_color: "#64748b",
      isProjected: false,
      recurring_rule_id: null,
      source: "transfer",
      asset_account_id: t.from_asset_account_id,
      transfer_id: t.id,
    });
    items.push({
      id: `transfer-in-${t.id}`,
      date: t.date,
      amount: t.amount,
      kind: "income",
      memo: `振替 ← ${fromName}`,
      category_id: null,
      category_name: "振替",
      category_color: "#64748b",
      isProjected: false,
      recurring_rule_id: null,
      source: "transfer",
      asset_account_id: t.to_asset_account_id,
      transfer_id: t.id,
    });
  }
  return items;
}

export function mergeLedgerWithTransfers(
  ledger: LedgerItem[],
  transfers: AccountTransfer[],
  accountNames: Map<string, string> | Record<string, string>,
  range?: { start: string; end: string },
): LedgerItem[] {
  return [...ledger, ...transferToLedgerItems(transfers, accountNames, range)].sort(
    (a, b) => a.date.localeCompare(b.date),
  );
}

export function buildPeriodLedger(
  period: PeriodRange,
  transactions: Transaction[],
  rules: RecurringRule[],
  cardPayments: CreditCardPayment[] = [],
  loans: Loan[] = [],
  cards: CreditCard[] = [],
  loanPayments: LoanPayment[] = [],
): LedgerItem[] {
  const items: LedgerItem[] = transactions
    .filter((t) => t.date >= period.start && t.date <= period.end)
    .map((t) => ({
      id: t.id,
      date: t.date,
      amount: t.amount,
      kind: t.kind,
      memo: t.memo,
      category_id: t.category_id,
      category_name: t.categories?.name ?? null,
      category_color: t.categories?.color ?? null,
      isProjected: false,
      recurring_rule_id: t.recurring_rule_id,
      source: "transaction" as const,
      asset_account_id: t.asset_account_id ?? null,
    }));

  const coveredRuleIds = new Set(
    items
      .map((i) => i.recurring_rule_id)
      .filter((id): id is string => Boolean(id)),
  );

  const startM = startOfMonth(parseISO(period.start));
  const endM = startOfMonth(parseISO(period.end));
  for (
    let cursor = startM;
    !isAfter(cursor, endM);
    cursor = addMonths(cursor, 1)
  ) {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    for (const rule of rules) {
      if (coveredRuleIds.has(rule.id)) continue;
      const occ = occurrenceDateInCalendarMonth(y, m, rule.day_of_month);
      if (occ < period.start || occ > period.end) continue;
      if (!ruleActiveOnDate(rule, occ)) continue;
      items.push({
        id: `proj-${rule.id}-${occ}`,
        date: occ,
        amount: rule.amount,
        kind: rule.kind,
        memo: rule.name,
        category_id: rule.category_id,
        category_name: rule.categories?.name ?? rule.name,
        category_color: rule.categories?.color ?? null,
        isProjected: true,
        recurring_rule_id: rule.id,
        source: "recurring",
        asset_account_id: rule.asset_account_id ?? null,
      });
      coveredRuleIds.add(rule.id);
    }
  }

  const confirmedCardKeys = new Set(
    cardPayments.map((p) => `${p.credit_card_id}:${p.payment_date}`),
  );
  const confirmedCardMonths = new Set(
    cardPayments.map((p) => `${p.credit_card_id}:${p.payment_date.slice(0, 7)}`),
  );

  for (const pay of cardPayments) {
    if (pay.payment_date < period.start || pay.payment_date > period.end) continue;
    const total = pay.one_time_amount + pay.installment_amount;
    items.push({
      id: `card-${pay.id}`,
      date: pay.payment_date,
      amount: total,
      kind: "expense",
      memo: `${pay.credit_cards?.name ?? "カード"}引落（一回${pay.one_time_amount.toLocaleString()}+分割${pay.installment_amount.toLocaleString()}）`,
      category_id: null,
      category_name: "クレジットカード",
      category_color: "#0369a1",
      isProjected: false,
      recurring_rule_id: null,
      source: "card",
      asset_account_id: cards.find((c) => c.id === pay.credit_card_id)?.asset_account_id ?? null,
      credit_card_id: pay.credit_card_id,
      one_time_amount: pay.one_time_amount,
      installment_amount: pay.installment_amount,
      payment_id: pay.id,
    });
  }

  for (
    let cursor = startM;
    !isAfter(cursor, endM);
    cursor = addMonths(cursor, 1)
  ) {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    for (const card of cards) {
      const payDate = occurrenceDateInCalendarMonth(y, m, card.payment_day);
      if (payDate < period.start || payDate > period.end) continue;
      const key = `${card.id}:${payDate}`;
      if (confirmedCardKeys.has(key)) continue;
      if (confirmedCardMonths.has(`${card.id}:${payDate.slice(0, 7)}`)) continue;
      const one = card.default_one_time_amount ?? 0;
      const inst = card.default_installment_amount ?? 0;
      const total = one + inst;
      if (total <= 0) continue;
      items.push({
        id: `card-proj-${card.id}-${payDate}`,
        date: payDate,
        amount: total,
        kind: "expense",
        memo: `${card.name}引落予定（一回${one.toLocaleString()}+分割${inst.toLocaleString()}）`,
        category_id: null,
        category_name: "クレジットカード",
        category_color: "#0369a1",
        isProjected: true,
        recurring_rule_id: null,
        source: "card",
        asset_account_id: card.asset_account_id ?? null,
        credit_card_id: card.id,
        one_time_amount: one,
        installment_amount: inst,
      });
    }
  }

  const confirmedLoanKeys = new Set(
    loanPayments.map((p) => `${p.loan_id}:${p.payment_date}`),
  );
  const confirmedLoanMonths = new Set(
    loanPayments.map((p) => `${p.loan_id}:${p.payment_date.slice(0, 7)}`),
  );

  for (const pay of loanPayments) {
    if (pay.payment_date < period.start || pay.payment_date > period.end) continue;
    const total = pay.principal_amount + pay.interest_amount;
    items.push({
      id: `loan-pay-${pay.id}`,
      date: pay.payment_date,
      amount: total,
      kind: "expense",
      memo: `${pay.loans?.name ?? "ローン"}（返済${pay.principal_amount.toLocaleString()}+利息${pay.interest_amount.toLocaleString()}）`,
      category_id: null,
      category_name: "ローン",
      category_color: "#9a3412",
      isProjected: false,
      recurring_rule_id: null,
      source: "loan",
      asset_account_id: loans.find((l) => l.id === pay.loan_id)?.asset_account_id ?? null,
      loan_id: pay.loan_id,
      principal_amount: pay.principal_amount,
      interest_amount: pay.interest_amount,
      payment_id: pay.id,
    });
  }

  for (
    let cursor = startM;
    !isAfter(cursor, endM);
    cursor = addMonths(cursor, 1)
  ) {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    for (const loan of loans) {
      const occ = occurrenceDateInCalendarMonth(y, m, loan.payment_day);
      if (occ < period.start || occ > period.end) continue;
      if (occ < loan.start_date) continue;
      if (loan.end_date && occ > loan.end_date) continue;
      if (confirmedLoanKeys.has(`${loan.id}:${occ}`)) continue;
      if (confirmedLoanMonths.has(`${loan.id}:${occ.slice(0, 7)}`)) continue;
      const principal = loan.principal_amount;
      const interest = loan.interest_amount;
      const total = principal + interest;
      if (total <= 0) continue;
      items.push({
        id: `loan-proj-${loan.id}-${occ}`,
        date: occ,
        amount: total,
        kind: "expense",
        memo: `${loan.name}（返済${principal.toLocaleString()}+利息${interest.toLocaleString()}）`,
        category_id: null,
        category_name: "ローン",
        category_color: "#9a3412",
        isProjected: true,
        recurring_rule_id: null,
        source: "loan",
        asset_account_id: loan.asset_account_id ?? null,
        loan_id: loan.id,
        principal_amount: principal,
        interest_amount: interest,
      });
    }
  }

  return items.sort((a, b) => a.date.localeCompare(b.date));
}

/** @deprecated */
export function buildMonthLedger(
  month: PeriodKey,
  transactions: Transaction[],
  rules: RecurringRule[],
): LedgerItem[] {
  const period = getPeriodRange(month, defaultSettings());
  return buildPeriodLedger(period, transactions, rules);
}

export function summarizeLedger(items: LedgerItem[]): {
  income: number;
  expense: number;
  net: number;
  projectedIncome: number;
  projectedExpense: number;
  cardExpense: number;
  loanExpense: number;
  expenseOther: number;
} {
  let income = 0;
  let expense = 0;
  let projectedIncome = 0;
  let projectedExpense = 0;
  let cardExpense = 0;
  let loanExpense = 0;

  for (const item of items) {
    if (item.source === "transfer") continue;
    if (item.kind === "income") {
      income += item.amount;
      if (item.isProjected) projectedIncome += item.amount;
    } else {
      expense += item.amount;
      if (item.isProjected) projectedExpense += item.amount;
      if (item.source === "card") cardExpense += item.amount;
      else if (item.source === "loan") loanExpense += item.amount;
    }
  }

  return {
    income,
    expense,
    net: income - expense,
    projectedIncome,
    projectedExpense,
    cardExpense,
    loanExpense,
    expenseOther: expense - cardExpense - loanExpense,
  };
}

export function findBaseBalance(
  snapshots: BalanceSnapshot[],
  beforeOrOn: string,
): { balance: number; asOf: string | null } {
  const eligible = snapshots
    .filter((s) => s.as_of_date <= beforeOrOn)
    .sort((a, b) => b.as_of_date.localeCompare(a.as_of_date));

  if (eligible.length === 0) return { balance: 0, asOf: null };
  return { balance: eligible[0].balance, asOf: eligible[0].as_of_date };
}

/** 口座ごとの最新残高合計（asOfCap 以前）。asOf は各口座最新日の最大（表示用）。 */
export function computeTotalAssetsBase(
  accountIds: string[],
  snapshots: {
    asset_account_id: string;
    as_of_date: string;
    balance: number;
  }[],
  asOfCap: string,
): { balance: number; asOf: string | null } {
  const sorted = [...snapshots].sort((a, b) =>
    b.as_of_date.localeCompare(a.as_of_date),
  );
  const latest = new Map<string, { balance: number; as_of_date: string }>();
  for (const s of sorted) {
    if (s.as_of_date > asOfCap) continue;
    if (!latest.has(s.asset_account_id)) {
      latest.set(s.asset_account_id, {
        balance: s.balance,
        as_of_date: s.as_of_date,
      });
    }
  }
  let balance = 0;
  let asOf: string | null = null;
  for (const id of accountIds) {
    const s = latest.get(id);
    if (!s) continue;
    balance += s.balance;
    if (!asOf || s.as_of_date > asOf) asOf = s.as_of_date;
  }
  return { balance, asOf };
}

/** 1口座の最新残高（asOfCap 以前） */
export function findAccountBaseBalance(
  accountId: string,
  snapshots: {
    asset_account_id: string;
    as_of_date: string;
    balance: number;
  }[],
  asOfCap: string,
): { balance: number; asOf: string | null } {
  const eligible = snapshots
    .filter((s) => s.asset_account_id === accountId && s.as_of_date <= asOfCap)
    .sort((a, b) => b.as_of_date.localeCompare(a.as_of_date));
  if (eligible.length === 0) return { balance: 0, asOf: null };
  return { balance: eligible[0].balance, asOf: eligible[0].as_of_date };
}

/** 台帳を引落口座別（未指定はメイン）に集計。振替は口座別では入出に含める */
export function ledgerPeriodAccountStats(
  items: LedgerItem[],
  mainAccountId: string | null,
): Record<string, { expense: number; income: number }> {
  const out: Record<string, { expense: number; income: number }> = {};
  for (const item of items) {
    const id = resolveLedgerAccountId(item.asset_account_id, mainAccountId);
    if (!id) continue;
    if (!out[id]) out[id] = { expense: 0, income: 0 };
    if (item.kind === "income") out[id].income += item.amount;
    else out[id].expense += item.amount;
  }
  return out;
}

export type AccountMovementView = {
  item: LedgerItem;
  /** 残高更新日以前（同日含む）→ 実残高に含み済みで計算から除外 */
  includedInBalance: boolean;
  /** 今日より前の日付（見た目用） */
  isPast: boolean;
  /** 期末予定の計算に使う */
  appliesToForecast: boolean;
};

export type AccountEndingForecast = {
  accountId: string;
  balance: number;
  asOf: string | null;
  hasSnapshot: boolean;
  periodIncome: number;
  periodExpense: number;
  appliedNet: number;
  endingBalance: number;
  movements: AccountMovementView[];
};

export type MultiAccountForecastInput = {
  accountIds: string[];
  accountSnapshots: {
    asset_account_id: string;
    as_of_date: string;
    balance: number;
  }[];
  mainAccountId: string | null;
  transfers?: AccountTransfer[];
  accountNameById?: Map<string, string> | Record<string, string>;
};

function accountNameMap(
  input?: Map<string, string> | Record<string, string>,
): Map<string, string> {
  if (!input) return new Map();
  if (input instanceof Map) return input;
  return new Map(Object.entries(input));
}

/**
 * 口座ごとの期末予定。
 * 計算: 各口座の実残高 + その口座の asOf 翌日以降の収支（振替含む）
 * 表示: 期間内の全明細を残し、含み済み／過去をフラグで区別
 */
export function buildAccountEndingForecasts(
  accountIds: string[],
  accountSnapshots: MultiAccountForecastInput["accountSnapshots"],
  ledger: LedgerItem[],
  mainAccountId: string | null,
  today: string,
  asOfCap: string = today,
): AccountEndingForecast[] {
  return accountIds.map((accountId) => {
    const base = findAccountBaseBalance(accountId, accountSnapshots, asOfCap);
    const hasSnapshot = base.asOf !== null;
    const movements: AccountMovementView[] = [];
    let periodIncome = 0;
    let periodExpense = 0;
    let appliedNet = 0;
    let ending = base.balance;

    for (const item of ledger) {
      const id = resolveLedgerAccountId(item.asset_account_id, mainAccountId);
      if (id !== accountId) continue;
      if (item.kind === "income") periodIncome += item.amount;
      else periodExpense += item.amount;

      const includedInBalance = Boolean(base.asOf && item.date <= base.asOf);
      const isPast = item.date < today;
      const appliesToForecast = !includedInBalance;
      movements.push({ item, includedInBalance, isPast, appliesToForecast });

      if (appliesToForecast) {
        const delta = signedAmount(item.kind, item.amount);
        appliedNet += delta;
        ending += delta;
      }
    }

    movements.sort(
      (a, b) =>
        a.item.date.localeCompare(b.item.date) ||
        a.item.amount - b.item.amount,
    );

    return {
      accountId,
      balance: base.balance,
      asOf: base.asOf,
      hasSnapshot,
      periodIncome,
      periodExpense,
      appliedNet,
      endingBalance: ending,
      movements,
    };
  });
}

function initAccountBalances(
  accountIds: string[],
  snapshots: MultiAccountForecastInput["accountSnapshots"],
  asOfCap: string,
): Map<string, { balance: number; asOf: string | null }> {
  const map = new Map<string, { balance: number; asOf: string | null }>();
  for (const id of accountIds) {
    map.set(id, findAccountBaseBalance(id, snapshots, asOfCap));
  }
  return map;
}

function applyItemsToAccountBalances(
  balances: Map<string, { balance: number; asOf: string | null }>,
  items: LedgerItem[],
  mainAccountId: string | null,
  dateFromExclusive: string | null,
  dateToExclusive: string | null,
) {
  for (const item of items) {
    if (dateFromExclusive && item.date <= dateFromExclusive) continue;
    if (dateToExclusive && item.date >= dateToExclusive) continue;
    const id = resolveLedgerAccountId(item.asset_account_id, mainAccountId);
    if (!id) continue;
    const cur = balances.get(id);
    if (!cur) continue;
    if (cur.asOf && item.date <= cur.asOf) continue;
    cur.balance += signedAmount(item.kind, item.amount);
  }
}

/**
 * Running cashflow from known balances.
 * multi 指定時は口座ごとに asOf を持ち、期末＝各口座期末の合計（基準日の max 足切りをしない）。
 */
export function buildCashflowForecast(
  fromKey: PeriodKey,
  periodsAhead: number,
  settings: Pick<UserSettings, "payday_type" | "payday_day">,
  transactions: Transaction[],
  rules: RecurringRule[],
  snapshots: BalanceSnapshot[],
  cardPayments: CreditCardPayment[],
  loans: Loan[],
  cards: CreditCard[] = [],
  loanPayments: LoanPayment[] = [],
  asOfCap: string = format(new Date(), "yyyy-MM-dd"),
  /** @deprecated 単一総資産起点。multi 優先 */
  baseOverride?: { balance: number; asOf: string | null } | null,
  multi?: MultiAccountForecastInput | null,
): CashflowRow[] {
  const first = getPeriodRange(fromKey, settings);
  const names = accountNameMap(multi?.accountNameById);
  const transfers = multi?.transfers ?? [];

  if (multi && multi.accountIds.length > 0) {
    const balances = initAccountBalances(
      multi.accountIds,
      multi.accountSnapshots,
      asOfCap,
    );

    // Bridge: each account from its own asOf until forecast window
    const minAsOf = [...balances.values()]
      .map((b) => b.asOf)
      .filter((d): d is string => Boolean(d))
      .sort()[0];
    if (minAsOf && minAsOf < first.start) {
      let key = periodContainingDate(
        format(addDays(parseISO(minAsOf), 1), "yyyy-MM-dd"),
        settings,
      ).key;
      while (true) {
        const p = getPeriodRange(key, settings);
        if (p.start >= first.start) break;
        const ledger = mergeLedgerWithTransfers(
          buildPeriodLedger(
            p,
            transactions,
            rules,
            cardPayments,
            loans,
            cards,
            loanPayments,
          ),
          transfers,
          names,
          p,
        );
        applyItemsToAccountBalances(
          balances,
          ledger,
          multi.mainAccountId,
          null,
          first.start,
        );
        key = shiftPeriod(key, 1);
        if (key > first.key) break;
      }
    } else if (![...balances.values()].some((b) => b.asOf)) {
      const priorActual = transactions.filter((t) => t.date < first.start);
      for (const t of priorActual) {
        const id = resolveLedgerAccountId(t.asset_account_id, multi.mainAccountId);
        if (!id) continue;
        const cur = balances.get(id);
        if (!cur) continue;
        cur.balance += signedAmount(t.kind, t.amount);
      }
    }

    const results: CashflowRow[] = [];
    for (let i = 0; i < periodsAhead; i++) {
      const key = shiftPeriod(fromKey, i);
      const period = getPeriodRange(key, settings);
      const ledger = mergeLedgerWithTransfers(
        buildPeriodLedger(
          period,
          transactions,
          rules,
          cardPayments,
          loans,
          cards,
          loanPayments,
        ),
        transfers,
        names,
        period,
      );
      const summary = summarizeLedger(ledger);

      applyItemsToAccountBalances(
        balances,
        ledger,
        multi.mainAccountId,
        null,
        null,
      );

      let endingBalance = 0;
      for (const id of multi.accountIds) {
        endingBalance += balances.get(id)?.balance ?? 0;
      }

      results.push({
        period,
        income: summary.income,
        expenseOther: summary.expenseOther,
        cardExpense: summary.cardExpense,
        loanExpense: summary.loanExpense,
        expense: summary.expense,
        net: summary.net,
        endingBalance,
        projectedIncome: summary.projectedIncome,
        projectedExpense: summary.projectedExpense,
      });
    }
    return results;
  }

  let base: { balance: number; asOf: string | null };
  if (baseOverride) {
    base = { balance: baseOverride.balance, asOf: baseOverride.asOf };
  } else {
    base = findBaseBalance(snapshots, asOfCap);
    if (!base.asOf) {
      base = findBaseBalance(snapshots, first.start);
    }
  }

  let balance = base.balance;
  const asOf = base.asOf;

  if (asOf && asOf < first.start) {
    let key = periodContainingDate(
      format(addDays(parseISO(asOf), 1), "yyyy-MM-dd"),
      settings,
    ).key;
    while (true) {
      const p = getPeriodRange(key, settings);
      if (p.start >= first.start) break;
      const ledger = buildPeriodLedger(
        p,
        transactions,
        rules,
        cardPayments,
        loans,
        cards,
        loanPayments,
      );
      for (const item of ledger) {
        if (item.date > asOf && item.date < first.start) {
          balance += signedAmount(item.kind, item.amount);
        }
      }
      key = shiftPeriod(key, 1);
      if (key > first.key) break;
    }
  } else if (!asOf) {
    const priorActual = transactions.filter((t) => t.date < first.start);
    for (const t of priorActual) {
      balance += signedAmount(t.kind, t.amount);
    }
  }

  const results: CashflowRow[] = [];
  for (let i = 0; i < periodsAhead; i++) {
    const key = shiftPeriod(fromKey, i);
    const period = getPeriodRange(key, settings);
    const ledger = buildPeriodLedger(
      period,
      transactions,
      rules,
      cardPayments,
      loans,
      cards,
      loanPayments,
    );
    const summary = summarizeLedger(ledger);

    for (const item of ledger) {
      if (asOf && item.date <= asOf) continue;
      balance += signedAmount(item.kind, item.amount);
    }

    results.push({
      period,
      income: summary.income,
      expenseOther: summary.expenseOther,
      cardExpense: summary.cardExpense,
      loanExpense: summary.loanExpense,
      expense: summary.expense,
      net: summary.net,
      endingBalance: balance,
      projectedIncome: summary.projectedIncome,
      projectedExpense: summary.projectedExpense,
    });
  }

  return results;
}

/** @deprecated */
export function buildForecast(
  fromMonth: PeriodKey,
  monthsAhead: number,
  transactions: Transaction[],
  rules: RecurringRule[],
  snapshots: BalanceSnapshot[],
) {
  return buildCashflowForecast(
    fromMonth,
    monthsAhead,
    defaultSettings(),
    transactions,
    rules,
    snapshots,
    [],
    [],
  ).map((r) => ({
    month: r.period.key,
    income: r.income,
    expense: r.expense,
    net: r.net,
    endingBalance: r.endingBalance,
    projectedIncome: r.projectedIncome,
    projectedExpense: r.projectedExpense,
  }));
}

export function categoryBreakdown(items: LedgerItem[]): {
  name: string;
  color: string;
  amount: number;
  kind: TransactionKind;
}[] {
  const map = new Map<
    string,
    { name: string; color: string; amount: number; kind: TransactionKind }
  >();

  for (const item of items) {
    if (item.kind !== "expense") continue;
    if (item.source === "transfer") continue;
    const key = item.category_id ?? item.category_name ?? "未分類";
    const current = map.get(key) ?? {
      name: item.category_name ?? "未分類",
      color: item.category_color ?? "#64748b",
      amount: 0,
      kind: item.kind,
    };
    current.amount += item.amount;
    map.set(key, current);
  }

  return [...map.values()].sort((a, b) => b.amount - a.amount);
}

export function suggestNextPaymentDates(
  paymentDay: number,
  monthOffset: number,
  count: number,
  from = new Date(),
): string[] {
  const dates: string[] = [];
  // Start from current month's closing month approximation
  let cursor = startOfMonth(from);
  for (let i = 0; i < count + 3 && dates.length < count; i++) {
    const payMonth = addMonths(cursor, monthOffset);
    const d = dateOnDay(
      payMonth.getFullYear(),
      payMonth.getMonth(),
      paymentDay,
    );
    if (d >= format(from, "yyyy-MM-dd")) dates.push(d);
    cursor = addMonths(cursor, 1);
  }
  return dates;
}

export type DailyBalanceMovement = {
  label: string;
  amount: number;
  kind: TransactionKind;
  projected: boolean;
  source?: LedgerItem["source"];
};

export type DailyBalanceRow = {
  date: string;
  opening: number;
  income: number;
  expense: number;
  net: number;
  closing: number;
  movements: DailyBalanceMovement[];
  /** その日に登録した実残高があれば比較用に出す */
  registeredBalance: number | null;
  gap: number | null;
};

/**
 * 給与期内の日別残高推移。
 * 起点は「期間開始日前日以前の最新登録残高」。なければ 0。
 * 各日は台帳の収支を加減し、同日の登録残高があれば差分を計算する。
 */
export function buildDailyBalanceRows(
  period: PeriodRange,
  ledger: LedgerItem[],
  snapshots: BalanceSnapshot[],
): { startBalance: number; startAsOf: string | null; rows: DailyBalanceRow[] } {
  const dayBeforeStart = format(
    addDays(parseISO(period.start), -1),
    "yyyy-MM-dd",
  );
  const base = findBaseBalance(snapshots, dayBeforeStart);
  let balance = base.balance;

  const byDate = new Map<string, LedgerItem[]>();
  for (const item of ledger) {
    if (item.date < period.start || item.date > period.end) continue;
    const list = byDate.get(item.date) ?? [];
    list.push(item);
    byDate.set(item.date, list);
  }

  const snapshotByDate = new Map(
    snapshots.map((s) => [s.as_of_date, s.balance] as const),
  );

  const rows: DailyBalanceRow[] = [];
  let cursor = parseISO(period.start);
  const end = parseISO(period.end);
  while (!isAfter(cursor, end)) {
    const date = format(cursor, "yyyy-MM-dd");
    const opening = balance;
    const items = (byDate.get(date) ?? []).slice().sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "income" ? -1 : 1;
      return b.amount - a.amount;
    });

    let income = 0;
    let expense = 0;
    const movements: DailyBalanceMovement[] = items.map((item) => {
      if (item.kind === "income") income += item.amount;
      else expense += item.amount;
      return {
        label:
          item.memo?.replace(/（.*）$/, "") ||
          item.category_name ||
          "未分類",
        amount: item.amount,
        kind: item.kind,
        projected: item.isProjected,
        source: item.source,
      };
    });

    const net = income - expense;
    balance = opening + net;
    const registered = snapshotByDate.get(date) ?? null;
    rows.push({
      date,
      opening,
      income,
      expense,
      net,
      closing: balance,
      movements,
      registeredBalance: registered,
      gap: registered == null ? null : registered - balance,
    });

    cursor = addDays(cursor, 1);
  }

  return {
    startBalance: base.balance,
    startAsOf: base.asOf,
    rows,
  };
}

