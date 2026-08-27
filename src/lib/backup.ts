import { createClient } from "@/lib/supabase/server";
import {
  fetchAccountBalanceSnapshots,
  fetchAccountTransfers,
  fetchAllTransactions,
  fetchAssetAccounts,
  fetchCardPayments,
  fetchCategories,
  fetchCreditCards,
  fetchLoanPayments,
  fetchLoans,
  fetchRecurringRules,
  fetchSettings,
  fetchSnapshots,
} from "@/lib/data";
import type {
  AccountBalanceSnapshot,
  AccountTransfer,
  AssetAccount,
  BalanceSnapshot,
  Category,
  CreditCard,
  CreditCardPayment,
  DailySpendCategory,
  DailySpendEntry,
  DailySpendHoliday,
  Loan,
  LoanPayment,
  RecurringRule,
  Transaction,
  UserSettings,
} from "@/lib/types";
import { DEFAULT_MAIN_BANK_NAME } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export const BACKUP_VERSION = 1 as const;

export type LedgerBackup = {
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  userId: string;
  categories: Category[];
  transactions: Transaction[];
  recurringRules: RecurringRule[];
  balanceSnapshots: BalanceSnapshot[];
  /** 複数口座（無い古いバックアップは省略可） */
  assetAccounts?: AssetAccount[];
  accountBalanceSnapshots?: AccountBalanceSnapshot[];
  /** 口座間振替（無い古いバックアップは省略可） */
  accountTransfers?: AccountTransfer[];
  userSettings: UserSettings;
  creditCards: CreditCard[];
  creditCardPayments: CreditCardPayment[];
  loans: Loan[];
  loanPayments: LoanPayment[];
  dailySpendCategories: DailySpendCategory[];
  dailySpendEntries: DailySpendEntry[];
  dailySpendHolidays: DailySpendHoliday[];
};

export async function buildLedgerBackup(): Promise<LedgerBackup | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [
    categories,
    transactions,
    recurringRules,
    balanceSnapshots,
    assetAccounts,
    accountBalanceSnapshots,
    accountTransfers,
    userSettings,
    creditCards,
    creditCardPayments,
    loans,
    loanPayments,
  ] = await Promise.all([
    fetchCategories(),
    fetchAllTransactions(),
    fetchRecurringRules(),
    fetchSnapshots(),
    fetchAssetAccounts(true),
    fetchAccountBalanceSnapshots(),
    fetchAccountTransfers(),
    fetchSettings(),
    fetchCreditCards(),
    fetchCardPayments(),
    fetchLoans(),
    fetchLoanPayments(),
  ]);

  const [{ data: dailyCats }, { data: dailyEntries }, { data: holidays }] =
    await Promise.all([
      supabase
        .from("daily_spend_categories")
        .select("*")
        .order("sort_order")
        .order("name"),
      supabase
        .from("daily_spend_entries")
        .select("*")
        .order("date", { ascending: true }),
      supabase
        .from("daily_spend_holidays")
        .select("*")
        .order("date", { ascending: true }),
    ]);

  // strip nested joins for clean restore
  const plainTransactions = transactions.map(
    ({ categories: _c, ...rest }) => rest,
  ) as Transaction[];
  const plainRules = recurringRules.map(
    ({ categories: _c, ...rest }) => rest,
  ) as RecurringRule[];
  const plainCardPayments = creditCardPayments.map(
    ({ credit_cards: _c, ...rest }) => rest,
  ) as CreditCardPayment[];
  const plainLoanPayments = loanPayments.map(
    ({ loans: _l, ...rest }) => rest,
  ) as LoanPayment[];

  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    userId: user.id,
    categories,
    transactions: plainTransactions,
    recurringRules: plainRules,
    balanceSnapshots,
    assetAccounts,
    accountBalanceSnapshots,
    accountTransfers,
    userSettings,
    creditCards,
    creditCardPayments: plainCardPayments,
    loans,
    loanPayments: plainLoanPayments,
    dailySpendCategories: (dailyCats as DailySpendCategory[]) ?? [],
    dailySpendEntries: (dailyEntries as DailySpendEntry[]) ?? [],
    dailySpendHolidays: (holidays as DailySpendHoliday[]) ?? [],
  };
}

function backupSummary(backup: LedgerBackup) {
  const accounts = backup.assetAccounts?.length ?? 0;
  return [
    `明細 ${backup.transactions.length}`,
    `項目 ${backup.categories.length}`,
    `定期 ${backup.recurringRules.length}`,
    accounts ? `口座 ${accounts}` : null,
    `日々 ${backup.dailySpendEntries.length}`,
  ]
    .filter(Boolean)
    .join(" / ");
}

function mapAccountId(
  oldId: string | null | undefined,
  accountIdMap: Map<string, string>,
): string | null {
  if (!oldId) return null;
  return accountIdMap.get(oldId) ?? null;
}

/** Apply a LedgerBackup into live tables for uid (does not check backup.userId). */
export async function applyLedgerBackupToUser(
  supabase: SupabaseClient,
  uid: string,
  backup: LedgerBackup,
): Promise<{ ok: true; summary: string } | { error: string }> {
  if (backup.version !== BACKUP_VERSION) {
    return { error: `未対応のバックアップ形式です（version=${backup.version}）` };
  }

  const deletes: { table: string }[] = [
    { table: "daily_spend_entries" },
    { table: "daily_spend_holidays" },
    { table: "daily_spend_categories" },
    { table: "loan_payments" },
    { table: "credit_card_payments" },
    { table: "account_transfers" },
    { table: "transactions" },
    { table: "recurring_rules" },
    { table: "loans" },
    { table: "credit_cards" },
    { table: "account_balance_snapshots" },
    { table: "asset_accounts" },
    { table: "balance_snapshots" },
    { table: "categories" },
  ];

  for (const { table } of deletes) {
    const { error } = await supabase.from(table).delete().eq("user_id", uid);
    // account tables may be missing before migration 015/016
    if (
      error &&
      table !== "account_balance_snapshots" &&
      table !== "asset_accounts" &&
      table !== "account_transfers"
    ) {
      return { error: `${table} の削除に失敗: ${error.message}` };
    }
  }

  const categoryIdMap = new Map<string, string>();
  if (backup.categories.length) {
    const payload = backup.categories.map((c) => ({
      user_id: uid,
      name: c.name,
      kind: c.kind,
      color: c.color,
      sort_order: c.sort_order,
    }));
    const { data, error } = await supabase
      .from("categories")
      .insert(payload)
      .select("id, name, kind");
    if (error) return { error: `categories: ${error.message}` };
    for (const old of backup.categories) {
      const neu = data?.find((d) => d.name === old.name && d.kind === old.kind);
      if (neu) categoryIdMap.set(old.id, neu.id);
    }
  }

  const accountIdMap = new Map<string, string>();
  const assetAccounts = backup.assetAccounts ?? [];
  if (assetAccounts.length) {
    // Insert non-main first? is_main unique — insert all; ensure one main
    const sorted = [...assetAccounts].sort(
      (a, b) => Number(b.is_main) - Number(a.is_main),
    );
    for (const a of sorted) {
      const { data, error } = await supabase
        .from("asset_accounts")
        .insert({
          user_id: uid,
          name: a.name,
          kind: a.kind,
          is_main: a.is_main,
          sort_order: a.sort_order,
          archived: a.archived ?? false,
        })
        .select("id")
        .single();
      if (error) {
        return { error: `asset_accounts: ${error.message}` };
      }
      if (data) accountIdMap.set(a.id, data.id);
    }
  } else {
    const { data: main, error } = await supabase
      .from("asset_accounts")
      .insert({
        user_id: uid,
        name: DEFAULT_MAIN_BANK_NAME,
        kind: "bank",
        is_main: true,
        sort_order: 0,
      })
      .select("id")
      .single();
    if (!error && main && backup.balanceSnapshots.length) {
      const payload = backup.balanceSnapshots.map((s) => ({
        user_id: uid,
        asset_account_id: main.id,
        as_of_date: s.as_of_date,
        balance: s.balance,
        note: s.note,
      }));
      await supabase.from("account_balance_snapshots").insert(payload);
    }
  }

  const accountSnaps = backup.accountBalanceSnapshots ?? [];
  if (accountSnaps.length && accountIdMap.size) {
    const payload = accountSnaps.flatMap((s) => {
      const accountId = accountIdMap.get(s.asset_account_id);
      if (!accountId) return [];
      return [
        {
          user_id: uid,
          asset_account_id: accountId,
          as_of_date: s.as_of_date,
          balance: s.balance,
          note: s.note,
        },
      ];
    });
    if (payload.length) {
      const { error } = await supabase
        .from("account_balance_snapshots")
        .insert(payload);
      if (error) return { error: `account_balance_snapshots: ${error.message}` };
    }
  }

  const transfers = backup.accountTransfers ?? [];
  if (transfers.length && accountIdMap.size) {
    const payload = transfers.flatMap((t) => {
      const fromId = accountIdMap.get(t.from_asset_account_id);
      const toId = accountIdMap.get(t.to_asset_account_id);
      if (!fromId || !toId) return [];
      return [
        {
          user_id: uid,
          from_asset_account_id: fromId,
          to_asset_account_id: toId,
          date: t.date,
          amount: t.amount,
          fee_amount: t.fee_amount ?? 0,
          memo: t.memo,
        },
      ];
    });
    if (payload.length) {
      const { error } = await supabase.from("account_transfers").insert(payload);
      if (error) return { error: `account_transfers: ${error.message}` };
    }
  }

  const ruleIdMap = new Map<string, string>();
  if (backup.recurringRules.length) {
    const payload = backup.recurringRules.map((r) => ({
      user_id: uid,
      category_id: r.category_id
        ? (categoryIdMap.get(r.category_id) ?? null)
        : null,
      asset_account_id: mapAccountId(r.asset_account_id, accountIdMap),
      name: r.name,
      amount: r.amount,
      kind: r.kind,
      interval: r.interval,
      day_of_month: r.day_of_month,
      start_date: r.start_date,
      end_date: r.end_date,
    }));
    const { data, error } = await supabase
      .from("recurring_rules")
      .insert(payload)
      .select("id, name, start_date");
    if (error) return { error: `recurring_rules: ${error.message}` };
    for (const old of backup.recurringRules) {
      const neu = data?.find(
        (d) => d.name === old.name && d.start_date === old.start_date,
      );
      if (neu) ruleIdMap.set(old.id, neu.id);
    }
  }

  if (backup.transactions.length) {
    const payload = backup.transactions.map((t) => ({
      user_id: uid,
      category_id: t.category_id
        ? (categoryIdMap.get(t.category_id) ?? null)
        : null,
      recurring_rule_id: t.recurring_rule_id
        ? (ruleIdMap.get(t.recurring_rule_id) ?? null)
        : null,
      asset_account_id: mapAccountId(t.asset_account_id, accountIdMap),
      date: t.date,
      amount: t.amount,
      kind: t.kind,
      memo: t.memo,
    }));
    const { error } = await supabase.from("transactions").insert(payload);
    if (error) return { error: `transactions: ${error.message}` };
  }

  if (backup.userSettings) {
    const { error } = await supabase.from("user_settings").upsert({
      user_id: uid,
      payday_type: backup.userSettings.payday_type,
      payday_day: backup.userSettings.payday_day,
    });
    if (error) return { error: `user_settings: ${error.message}` };
  }

  if (backup.balanceSnapshots.length) {
    const payload = backup.balanceSnapshots.map((s) => ({
      user_id: uid,
      as_of_date: s.as_of_date,
      balance: s.balance,
      note: s.note,
    }));
    const { error } = await supabase.from("balance_snapshots").insert(payload);
    if (error) return { error: `balance_snapshots: ${error.message}` };
  }

  const cardIdMap = new Map<string, string>();
  if (backup.creditCards.length) {
    const payload = backup.creditCards.map((c) => ({
      user_id: uid,
      name: c.name,
      closing_day: c.closing_day,
      payment_day: c.payment_day,
      payment_month_offset: c.payment_month_offset,
      default_one_time_amount: c.default_one_time_amount,
      default_installment_amount: c.default_installment_amount,
      asset_account_id: mapAccountId(c.asset_account_id, accountIdMap),
    }));
    const { data, error } = await supabase
      .from("credit_cards")
      .insert(payload)
      .select("id, name");
    if (error) return { error: `credit_cards: ${error.message}` };
    for (const old of backup.creditCards) {
      const neu = data?.find((d) => d.name === old.name);
      if (neu) cardIdMap.set(old.id, neu.id);
    }
  }

  if (backup.creditCardPayments.length) {
    const payload = backup.creditCardPayments.flatMap((p) => {
      const cardId = cardIdMap.get(p.credit_card_id);
      if (!cardId) return [];
      return [
        {
          user_id: uid,
          credit_card_id: cardId,
          payment_date: p.payment_date,
          one_time_amount: p.one_time_amount,
          installment_amount: p.installment_amount,
          note: p.note,
        },
      ];
    });
    if (payload.length) {
      const { error } = await supabase
        .from("credit_card_payments")
        .insert(payload);
      if (error) return { error: `credit_card_payments: ${error.message}` };
    }
  }

  const loanIdMap = new Map<string, string>();
  if (backup.loans.length) {
    const payload = backup.loans.map((l) => ({
      user_id: uid,
      name: l.name,
      principal_amount: l.principal_amount,
      interest_amount: l.interest_amount,
      payment_day: l.payment_day,
      start_date: l.start_date,
      end_date: l.end_date,
      asset_account_id: mapAccountId(l.asset_account_id, accountIdMap),
    }));
    const { data, error } = await supabase
      .from("loans")
      .insert(payload)
      .select("id, name");
    if (error) return { error: `loans: ${error.message}` };
    for (const old of backup.loans) {
      const neu = data?.find((d) => d.name === old.name);
      if (neu) loanIdMap.set(old.id, neu.id);
    }
  }

  if (backup.loanPayments.length) {
    const payload = backup.loanPayments.flatMap((p) => {
      const loanId = loanIdMap.get(p.loan_id);
      if (!loanId) return [];
      return [
        {
          user_id: uid,
          loan_id: loanId,
          payment_date: p.payment_date,
          principal_amount: p.principal_amount,
          interest_amount: p.interest_amount,
          note: p.note,
        },
      ];
    });
    if (payload.length) {
      const { error } = await supabase.from("loan_payments").insert(payload);
      if (error) return { error: `loan_payments: ${error.message}` };
    }
  }

  const dailyCatIdMap = new Map<string, string>();
  if (backup.dailySpendCategories.length) {
    const payload = backup.dailySpendCategories.map((c) => ({
      user_id: uid,
      name: c.name,
      monthly_budget: c.monthly_budget,
      color: c.color,
      sort_order: c.sort_order,
    }));
    const { data, error } = await supabase
      .from("daily_spend_categories")
      .insert(payload)
      .select("id, name");
    if (error) return { error: `daily_spend_categories: ${error.message}` };
    for (const old of backup.dailySpendCategories) {
      const neu = data?.find((d) => d.name === old.name);
      if (neu) dailyCatIdMap.set(old.id, neu.id);
    }
  }

  if (backup.dailySpendEntries.length) {
    const payload = backup.dailySpendEntries.flatMap((e) => {
      const categoryId = dailyCatIdMap.get(e.category_id);
      if (!categoryId) return [];
      return [
        {
          user_id: uid,
          category_id: categoryId,
          date: e.date,
          amount: e.amount,
          points_amount: e.points_amount ?? 0,
          memo: e.memo,
        },
      ];
    });
    if (payload.length) {
      const { error } = await supabase
        .from("daily_spend_entries")
        .insert(payload);
      if (error) return { error: `daily_spend_entries: ${error.message}` };
    }
  }

  if (backup.dailySpendHolidays.length) {
    const payload = backup.dailySpendHolidays.map((h) => ({
      user_id: uid,
      date: h.date,
      note: h.note,
    }));
    const { error } = await supabase
      .from("daily_spend_holidays")
      .insert(payload);
    if (error) return { error: `daily_spend_holidays: ${error.message}` };
  }

  return { ok: true, summary: backupSummary(backup) };
}

export async function restoreLedgerBackup(backup: LedgerBackup): Promise<
  | { ok: true; summary: string }
  | { error: string }
> {
  if (backup.version !== BACKUP_VERSION) {
    return { error: `未対応のバックアップ形式です（version=${backup.version}）` };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "ログインが必要です" };
  if (backup.userId && backup.userId !== user.id) {
    return { error: "別ユーザーのバックアップです。復元できません。" };
  }

  return applyLedgerBackupToUser(supabase, user.id, backup);
}
