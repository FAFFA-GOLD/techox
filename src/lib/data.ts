import { createClient } from "@/lib/supabase/server";
import { migrationHint, ensureSchedulesMigrated } from "@/lib/scheduled-sync";
import { computeTotalAssetsBase, defaultSettings } from "@/lib/money";
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
  DailySpendMakikoOff,
  DailyScratchpad,
  LunchMenuItem,
  Loan,
  LoanPayment,
  PayslipImport,
  RecurringRule,
  SuicaBalanceSnapshot,
  SuicaDisplayBalance,
  Transaction,
  UserSettings,
} from "@/lib/types";
import { TRANSPORT_CATEGORY_NAME, DEFAULT_MAIN_BANK_NAME, DEFAULT_SECOND_BANK_NAME, DEFAULT_WALLET_ACCOUNTS } from "@/lib/types";

export async function fetchCategories(): Promise<Category[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("categories")
    .select("*")
    .order("sort_order")
    .order("name");
  return (data as Category[]) ?? [];
}

export async function fetchTransactionsInRange(
  start: string,
  end: string,
): Promise<Transaction[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("transactions")
    .select("*, categories(id, name, color, kind)")
    .gte("date", start)
    .lte("date", end)
    .order("date", { ascending: true });
  return (data as Transaction[]) ?? [];
}

export async function fetchAllTransactions(): Promise<Transaction[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("transactions")
    .select("*, categories(id, name, color, kind)")
    .order("date", { ascending: true });
  return (data as Transaction[]) ?? [];
}

export async function fetchRecurringRules(): Promise<RecurringRule[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("recurring_rules")
    .select("*, categories(id, name, color, kind)")
    .order("start_date");
  return (data as RecurringRule[]) ?? [];
}

export async function fetchSnapshots(): Promise<BalanceSnapshot[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("balance_snapshots")
    .select("*")
    .order("as_of_date", { ascending: false });
  return (data as BalanceSnapshot[]) ?? [];
}

/** Ensure main bank exists; create if missing (for users after migration / new users). */
export async function ensureMainAssetAccount(): Promise<AssetAccount | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: existing } = await supabase
    .from("asset_accounts")
    .select("*")
    .eq("user_id", user.id)
    .eq("is_main", true)
    .maybeSingle();
  if (existing) {
    const row = existing as AssetAccount;
    // 旧名称のままならあいち銀行へ（一度きり）
    if (row.name === "メインバンク") {
      const { data: renamed } = await supabase
        .from("asset_accounts")
        .update({
          name: DEFAULT_MAIN_BANK_NAME,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id)
        .select("*")
        .single();
      if (renamed) return renamed as AssetAccount;
    }
    return row;
  }

  const { data: created, error } = await supabase
    .from("asset_accounts")
    .insert({
      user_id: user.id,
      name: DEFAULT_MAIN_BANK_NAME,
      kind: "bank",
      is_main: true,
      sort_order: 0,
    })
    .select("*")
    .single();
  if (error || !created) return null;
  return created as AssetAccount;
}

/** 三菱東京UFJ銀行など、既定の追加銀行を用意する */
export async function ensureDefaultSecondaryBanks(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: existing } = await supabase
    .from("asset_accounts")
    .select("id")
    .eq("user_id", user.id)
    .eq("name", DEFAULT_SECOND_BANK_NAME)
    .maybeSingle();
  if (existing) return;

  const { data: maxRow } = await supabase
    .from("asset_accounts")
    .select("sort_order")
    .eq("user_id", user.id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  await supabase.from("asset_accounts").insert({
    user_id: user.id,
    name: DEFAULT_SECOND_BANK_NAME,
    kind: "bank",
    is_main: false,
    sort_order: (maxRow?.sort_order ?? 0) + 1,
  });
}

const WALLET_ALIASES: { canonical: string; aliases: string[] }[] = [
  {
    canonical: "ドコモ銀行",
    aliases: ["Docomo銀行", "docomo銀行", "DOCOMO銀行"],
  },
  { canonical: "PayPay", aliases: ["PayPay残高", "PayPay残高電子マネー"] },
  {
    canonical: "R-PAY",
    aliases: ["楽天ペイ", "楽天ペイ電子マネー", "楽天Pay"],
  },
];

async function retargetAccount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: string,
  column: string,
  fromId: string,
  toId: string,
) {
  await supabase.from(table).update({ [column]: toId }).eq(column, fromId);
}

async function moveSnapshots(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  fromId: string,
  toId: string,
) {
  const { data } = await supabase
    .from("account_balance_snapshots")
    .select("id, as_of_date, balance, note")
    .eq("asset_account_id", fromId);
  for (const snap of data ?? []) {
    const { error } = await supabase
      .from("account_balance_snapshots")
      .update({ asset_account_id: toId })
      .eq("id", snap.id);
    if (error) {
      await supabase.from("account_balance_snapshots").delete().eq("id", snap.id);
    }
  }
  void userId;
}

async function mergeWalletAliases(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  rows: { id: string; name: string; archived?: boolean }[],
) {
  for (const group of WALLET_ALIASES) {
    const canonical = rows.find((row) => row.name === group.canonical && !row.archived);
    if (!canonical) continue;
    for (const aliasName of group.aliases) {
      const alias = rows.find((row) => row.name === aliasName && !row.archived);
      if (!alias || alias.id === canonical.id) continue;
      await retargetAccount(
        supabase,
        "daily_spend_entries",
        "asset_account_id",
        alias.id,
        canonical.id,
      );
      await retargetAccount(
        supabase,
        "scheduled_rules",
        "asset_account_id",
        alias.id,
        canonical.id,
      );
      await retargetAccount(
        supabase,
        "transactions",
        "asset_account_id",
        alias.id,
        canonical.id,
      );
      await retargetAccount(
        supabase,
        "recurring_rules",
        "asset_account_id",
        alias.id,
        canonical.id,
      );
      await retargetAccount(
        supabase,
        "credit_cards",
        "asset_account_id",
        alias.id,
        canonical.id,
      );
      await retargetAccount(
        supabase,
        "loans",
        "asset_account_id",
        alias.id,
        canonical.id,
      );
      await retargetAccount(
        supabase,
        "account_transfers",
        "from_asset_account_id",
        alias.id,
        canonical.id,
      );
      await retargetAccount(
        supabase,
        "account_transfers",
        "to_asset_account_id",
        alias.id,
        canonical.id,
      );
      await moveSnapshots(supabase, userId, alias.id, canonical.id);
      const { error: archiveError } = await supabase
        .from("asset_accounts")
        .update({ archived: true })
        .eq("id", alias.id);
      if (!archiveError) alias.archived = true;
    }
  }
}

/** ドコモ / Olive / PayPay / R-PAY / Suica を無ければ追加。Suica の旧残高を初回だけ移す。 */
export async function ensureWalletAccounts(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: existing } = await supabase
    .from("asset_accounts")
    .select("id, name, sort_order, archived")
    .eq("user_id", user.id);
  const rows = existing ?? [];
  const names = new Set(rows.map((r) => r.name as string));
  let sort = rows.reduce((m, r) => Math.max(m, r.sort_order as number), 0);

  for (const wallet of DEFAULT_WALLET_ACCOUNTS) {
    if (names.has(wallet.name)) continue;
    sort += 1;
    const { data: created } = await supabase
      .from("asset_accounts")
      .insert({
        user_id: user.id,
        name: wallet.name,
        kind: wallet.kind,
        is_main: false,
        sort_order: sort,
      })
      .select("id, name")
      .single();
    if (created) {
      names.add(wallet.name);
      rows.push({
        id: created.id,
        name: created.name,
        sort_order: sort,
        archived: false,
      });
    }
  }

  await mergeWalletAliases(supabase, user.id, rows);

  const suica = rows.find((r) => r.name === "Suica");
  if (!suica) return;
  const { count } = await supabase
    .from("account_balance_snapshots")
    .select("id", { count: "exact", head: true })
    .eq("asset_account_id", suica.id);
  if (count && count > 0) return;

  const { data: latest } = await supabase
    .from("suica_balance_snapshots")
    .select("as_of_date, balance, note")
    .eq("user_id", user.id)
    .order("as_of_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!latest) return;
  await supabase.from("account_balance_snapshots").insert({
    user_id: user.id,
    asset_account_id: suica.id,
    as_of_date: latest.as_of_date,
    balance: latest.balance,
    note: latest.note ?? "Suica残高から移行",
  });
}

export async function fetchAssetAccounts(
  includeArchived = false,
): Promise<AssetAccount[]> {
  const supabase = await createClient();
  await ensureMainAssetAccount();
  await ensureDefaultSecondaryBanks();
  await ensureWalletAccounts();
  let q = supabase
    .from("asset_accounts")
    .select("*")
    .order("sort_order")
    .order("created_at");
  if (!includeArchived) {
    q = q.eq("archived", false);
  }
  const { data, error } = await q;
  if (error) return [];
  return (data as AssetAccount[]) ?? [];
}

export async function fetchAccountBalanceSnapshots(): Promise<
  AccountBalanceSnapshot[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("account_balance_snapshots")
    .select("*")
    .order("as_of_date", { ascending: false });
  if (error) return [];
  return (data as AccountBalanceSnapshot[]) ?? [];
}

export async function fetchAccountTransfers(): Promise<AccountTransfer[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("account_transfers")
    .select("*")
    .order("date", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) return [];
  return (data as AccountTransfer[]) ?? [];
}

export async function fetchAccountTransfersInRange(
  start: string,
  end: string,
): Promise<AccountTransfer[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("account_transfers")
    .select("*")
    .gte("date", start)
    .lte("date", end)
    .order("date", { ascending: true });
  if (error) return [];
  return (data as AccountTransfer[]) ?? [];
}

/** Latest snapshot per account (first occurrence after date-desc sort). */
export function latestAccountBalances(
  accounts: AssetAccount[],
  snapshots: AccountBalanceSnapshot[],
): Map<string, AccountBalanceSnapshot> {
  const map = new Map<string, AccountBalanceSnapshot>();
  for (const s of snapshots) {
    if (!map.has(s.asset_account_id)) {
      map.set(s.asset_account_id, s);
    }
  }
  // touch only known accounts
  for (const a of accounts) {
    if (!map.has(a.id)) {
      // leave absent
    }
  }
  return map;
}

export function sumLatestTotalAssets(
  accounts: AssetAccount[],
  snapshots: AccountBalanceSnapshot[],
  asOfCap: string = "9999-12-31",
): { total: number; asOfDate: string | null } {
  const activeIds = accounts.filter((a) => !a.archived).map((a) => a.id);
  const base = computeTotalAssetsBase(activeIds, snapshots, asOfCap);
  return { total: base.balance, asOfDate: base.asOf };
}

export async function fetchSettings(): Promise<UserSettings> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return defaultSettings();

  const { data } = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!data) {
    return { ...defaultSettings(), user_id: user.id };
  }
  return data as UserSettings;
}

export async function fetchCreditCards(): Promise<CreditCard[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("credit_cards")
    .select("*")
    .order("name");
  return (data as CreditCard[]) ?? [];
}

export async function fetchCardPayments(): Promise<CreditCardPayment[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("credit_card_payments")
    .select("*, credit_cards(id, name)")
    .order("payment_date", { ascending: true });
  return (data as CreditCardPayment[]) ?? [];
}

export async function fetchLoans(): Promise<Loan[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("loans").select("*").order("name");
  return (data as Loan[]) ?? [];
}

export async function fetchLoanPayments(): Promise<LoanPayment[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("loan_payments")
    .select("*, loans(id, name)")
    .order("payment_date", { ascending: true });
  return (data as LoanPayment[]) ?? [];
}

export async function fetchPayslipImportsInRange(
  start: string,
  end: string,
): Promise<PayslipImport[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payslip_imports")
    .select("*")
    .gte("payday", start)
    .lte("payday", end)
    .order("payday", { ascending: false });
  if (error) return [];
  return ((data as PayslipImport[]) ?? []).map((row) => ({
    ...row,
    details: Array.isArray(row.details) ? row.details : [],
  }));
}

export async function fetchPayslipImportByPayday(
  payday: string,
): Promise<PayslipImport | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payslip_imports")
    .select("*")
    .eq("payday", payday)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as PayslipImport;
  return {
    ...row,
    details: Array.isArray(row.details) ? row.details : [],
  };
}

const DEFAULT_DAILY_CATEGORIES = [
  { name: "家族", monthly_budget: 35000, color: "#be185d", sort_order: 1 },
  { name: "昼食", monthly_budget: 19000, color: "#c2410c", sort_order: 2 },
  { name: "雑費", monthly_budget: 10000, color: "#0369a1", sort_order: 3 },
  { name: "酒", monthly_budget: 0, color: "#7c2d12", sort_order: 4 },
  { name: "お菓子", monthly_budget: 0, color: "#a16207", sort_order: 5 },
  {
    name: "その他",
    monthly_budget: 0,
    color: "#7c3aed",
    sort_order: 6,
  },
  { name: "交通費", monthly_budget: 18860, color: "#4d7c0f", sort_order: 7 },
  { name: "機密費", monthly_budget: 0, color: "#57534e", sort_order: 8 },
  { name: "固定費", monthly_budget: 0, color: "#44403c", sort_order: 9 },
] as const;

/** 旧スケジュール値 → 本機能の初期予算（まだ旧値のときだけ。手動変更は上書きしない） */
const DAILY_BUDGET_MIGRATIONS = [
  { name: "家族", from: 40000, to: 35000 },
  { name: "昼食", from: 15000, to: 19000 },
  { name: "昼食", from: 20000, to: 19000 },
  { name: "昼食", from: 26000, to: 19000 },
  { name: "雑費", from: 20000, to: 10000 },
  { name: "日用", from: 20000, to: 10000 },
] as const;

/** 用途名の置換（表示名変更） */
const CATEGORY_RENAMES = [
  { from: "デート", to: "家族" },
  { from: "日用", to: "雑費" },
] as const;

async function dedupeDailySpendCategories(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rows: DailySpendCategory[],
): Promise<DailySpendCategory[]> {
  const keepers = new Map<string, DailySpendCategory>();
  const dupes: DailySpendCategory[] = [];

  for (const row of rows) {
    const keep = keepers.get(row.name);
    if (!keep) {
      keepers.set(row.name, row);
      continue;
    }
    // 先に作られた方を残す
    if (row.created_at < keep.created_at) {
      dupes.push(keep);
      keepers.set(row.name, row);
    } else {
      dupes.push(row);
    }
  }

  for (const dupe of dupes) {
    const keep = keepers.get(dupe.name);
    if (!keep) continue;
    await supabase
      .from("daily_spend_entries")
      .update({ category_id: keep.id })
      .eq("category_id", dupe.id);
    await supabase.from("daily_spend_categories").delete().eq("id", dupe.id);
  }

  return Array.from(keepers.values()).sort(
    (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "ja"),
  );
}

/** 用途カテゴリを初期登録・不足分追加・予算移行して返す */
export async function ensureDailySpendCategories(): Promise<DailySpendCategory[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: existing } = await supabase
    .from("daily_spend_categories")
    .select("*")
    .order("sort_order")
    .order("name");

  let rows = await dedupeDailySpendCategories(
    supabase,
    (existing as DailySpendCategory[]) ?? [],
  );

  // デート → 家族
  for (const rename of CATEGORY_RENAMES) {
    const old = rows.find((r) => r.name === rename.from);
    if (!old) continue;
    const conflict = rows.find((r) => r.name === rename.to);
    if (conflict) {
      await supabase
        .from("daily_spend_entries")
        .update({ category_id: conflict.id })
        .eq("category_id", old.id);
      await supabase.from("daily_spend_categories").delete().eq("id", old.id);
    } else {
      await supabase
        .from("daily_spend_categories")
        .update({ name: rename.to })
        .eq("id", old.id);
    }
  }

  const { data: afterRename } = await supabase
    .from("daily_spend_categories")
    .select("*")
    .order("sort_order")
    .order("name");
  rows = await dedupeDailySpendCategories(
    supabase,
    (afterRename as DailySpendCategory[]) ?? [],
  );

  if (rows.length === 0) {
    const { data: inserted } = await supabase
      .from("daily_spend_categories")
      .insert(
        DEFAULT_DAILY_CATEGORIES.map((c) => ({
          user_id: user.id,
          ...c,
        })),
      )
      .select("*")
      .order("sort_order");
    return (inserted as DailySpendCategory[]) ?? [];
  }

  const byName = new Map(rows.map((r) => [r.name, r]));
  const missing = DEFAULT_DAILY_CATEGORIES.filter((c) => !byName.has(c.name));
  for (const c of missing) {
    // 競合で二重挿入されても後段の dedupe で吸収する
    await supabase.from("daily_spend_categories").insert({
      user_id: user.id,
      ...c,
    });
  }

  // 初期用途の表示順・その他の予算0を揃える
  for (const c of DEFAULT_DAILY_CATEGORIES) {
    const row = byName.get(c.name);
    if (!row) continue;
    const patch: { sort_order?: number; monthly_budget?: number } = {};
    if (row.sort_order !== c.sort_order) patch.sort_order = c.sort_order;
    if (c.monthly_budget === 0 && row.monthly_budget !== 0) {
      patch.monthly_budget = 0;
    }
    if (Object.keys(patch).length > 0) {
      await supabase
        .from("daily_spend_categories")
        .update(patch)
        .eq("id", row.id);
    }
  }

  for (const m of DAILY_BUDGET_MIGRATIONS) {
    const row = byName.get(m.name);
    if (row && row.monthly_budget === m.from) {
      await supabase
        .from("daily_spend_categories")
        .update({ monthly_budget: m.to })
        .eq("id", row.id);
    }
  }

  const { data: refreshed } = await supabase
    .from("daily_spend_categories")
    .select("*")
    .order("sort_order")
    .order("name");

  return dedupeDailySpendCategories(
    supabase,
    (refreshed as DailySpendCategory[]) ?? [],
  );
}

export async function fetchBalanceMovementsSince(
  sinceExclusive: string,
  untilInclusive?: string,
): Promise<
  {
    date: string;
    amount: number;
    kind: string;
    asset_account_id: string | null;
  }[]
> {
  const supabase = await createClient();
  let query = supabase
    .from("daily_spend_entries")
    .select("date, amount, kind, asset_account_id")
    .gt("date", sinceExclusive)
    .not("asset_account_id", "is", null);
  if (untilInclusive) query = query.lte("date", untilInclusive);
  const { data, error } = await query;
  if (error) return [];
  return data ?? [];
}

export async function prepareDailySpendSchedules(
  categories: DailySpendCategory[],
  accounts: AssetAccount[],
): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const res = await ensureSchedulesMigrated(
    supabase,
    user.id,
    categories,
    accounts,
  );
  if (!res.error) return null;
  return migrationHint(res.error) ?? res.error;
}

export async function fetchScheduledRules(): Promise<
  import("@/lib/types").ScheduledRule[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("scheduled_rules")
    .select("*")
    .order("day_of_month")
    .order("name");
  if (error) return [];
  return (data ?? []) as import("@/lib/types").ScheduledRule[];
}

/** 取引から作られた日々の記録。登録一覧で「11/1分」のように出す。 */
export async function fetchScheduledSpendEntries(): Promise<DailySpendEntry[]> {
  const supabase = await createClient();
  const pageSize = 1000;
  const rows: DailySpendEntry[] = [];
  for (let from = 0; from < 20000; from += pageSize) {
    const { data, error } = await supabase
      .from("daily_spend_entries")
      .select(
        "id, date, amount, kind, memo, asset_account_id, category_id, scheduled_rule_id, amount_locked, created_at",
      )
      .not("scheduled_rule_id", "is", null)
      .order("date", { ascending: true })
      .order("created_at", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error || !data || data.length === 0) break;
    rows.push(...(data as DailySpendEntry[]));
    if (data.length < pageSize) break;
  }
  return rows;
}

export async function fetchDailySpendEntriesInRange(
  start: string,
  end: string,
): Promise<DailySpendEntry[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("daily_spend_entries")
    .select(
      "*, daily_spend_categories(id, name, color, monthly_budget)",
    )
    .gte("date", start)
    .lte("date", end)
    .order("date", { ascending: true })
    .order("created_at", { ascending: true });
  return (data as DailySpendEntry[]) ?? [];
}

export async function fetchSuicaBalanceSnapshots(): Promise<
  SuicaBalanceSnapshot[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("suica_balance_snapshots")
    .select("*")
    .order("as_of_date", { ascending: false });
  if (error) return [];
  return (data as SuicaBalanceSnapshot[]) ?? [];
}

/**
 * Suica 推定残高 = 最新登録残高 − 登録日より後の交通費合計。
 * 毎日の支出の月合計には含めない（交通費予算とも独立）。
 */
export async function fetchSuicaDisplayBalance(): Promise<SuicaDisplayBalance> {
  const supabase = await createClient();
  const { data: latest, error: snapError } = await supabase
    .from("suica_balance_snapshots")
    .select("*")
    .order("as_of_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (snapError || !latest) {
    return {
      balance: null,
      asOf: null,
      snapshotBalance: null,
      spentAfter: 0,
    };
  }

  const snap = latest as SuicaBalanceSnapshot;
  const { data: transportCat } = await supabase
    .from("daily_spend_categories")
    .select("id")
    .eq("name", TRANSPORT_CATEGORY_NAME)
    .maybeSingle();

  if (!transportCat?.id) {
    return {
      balance: snap.balance,
      asOf: snap.as_of_date,
      snapshotBalance: snap.balance,
      spentAfter: 0,
    };
  }

  const { data: rows } = await supabase
    .from("daily_spend_entries")
    .select("amount")
    .eq("category_id", transportCat.id)
    .gt("date", snap.as_of_date);

  const spentAfter = ((rows as { amount: number }[]) ?? []).reduce(
    (s, r) => s + r.amount,
    0,
  );

  return {
    balance: snap.balance - spentAfter,
    asOf: snap.as_of_date,
    snapshotBalance: snap.balance,
    spentAfter,
  };
}

export async function fetchDailySpendHolidaysInRange(
  start: string,
  end: string,
): Promise<DailySpendHoliday[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("daily_spend_holidays")
    .select("*")
    .gte("date", start)
    .lte("date", end)
    .order("date", { ascending: true });
  return (data as DailySpendHoliday[]) ?? [];
}

export async function fetchDailySpendMakikoOffsInRange(
  start: string,
  end: string,
): Promise<DailySpendMakikoOff[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("daily_spend_makiko_offs")
    .select("*")
    .gte("date", start)
    .lte("date", end)
    .order("date", { ascending: true });
  if (error) return [];
  return (data as DailySpendMakikoOff[]) ?? [];
}

export async function fetchDailyScratchpad(
  _monthKey?: string,
): Promise<DailyScratchpad | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("daily_scratchpads")
    .select("*")
    .eq("month_key", "shared")
    .maybeSingle();
  if (error || !data) return null;
  return data as DailyScratchpad;
}

export async function fetchLunchMenuItems(): Promise<LunchMenuItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lunch_menu_items")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return data as LunchMenuItem[];
}
