export type TransactionKind = "expense" | "income";
export type PaydayType = "last_day" | "fixed";

export type Category = {
  id: string;
  user_id: string;
  name: string;
  kind: TransactionKind;
  color: string;
  sort_order: number;
  created_at: string;
};

export type Transaction = {
  id: string;
  user_id: string;
  category_id: string | null;
  recurring_rule_id: string | null;
  asset_account_id?: string | null;
  date: string;
  amount: number;
  kind: TransactionKind;
  memo: string | null;
  created_at: string;
  updated_at: string;
  categories?: Pick<Category, "id" | "name" | "color" | "kind"> | null;
};

export type RecurringRule = {
  id: string;
  user_id: string;
  category_id: string | null;
  asset_account_id?: string | null;
  name: string;
  amount: number;
  kind: TransactionKind;
  interval: "monthly";
  day_of_month: number;
  start_date: string;
  end_date: string | null;
  created_at: string;
  categories?: Pick<Category, "id" | "name" | "color" | "kind"> | null;
};

export type BalanceSnapshot = {
  id: string;
  user_id: string;
  as_of_date: string;
  balance: number;
  note: string | null;
  created_at: string;
};

export type AssetAccountKind = "bank" | "emoney" | "other";

/** 既定のメイン銀行口座名（当面 is_main。将来メイン変更の予定あり） */
export const DEFAULT_MAIN_BANK_NAME = "あいち銀行";

/** 追加の既定銀行口座（メインではない） */
export const DEFAULT_SECOND_BANK_NAME = "三菱東京UFJ銀行";

export type AssetAccount = {
  id: string;
  user_id: string;
  name: string;
  kind: AssetAccountKind;
  is_main: boolean;
  sort_order: number;
  archived: boolean;
  created_at: string;
  updated_at: string;
};

export type AccountBalanceSnapshot = {
  id: string;
  user_id: string;
  asset_account_id: string;
  as_of_date: string;
  balance: number;
  note: string | null;
  created_at: string;
};

/** 口座間振替（手数料は出金側負担・既定 0） */
export type AccountTransfer = {
  id: string;
  user_id: string;
  from_asset_account_id: string;
  to_asset_account_id: string;
  date: string;
  amount: number;
  fee_amount: number;
  memo: string | null;
  created_at: string;
};

export function assetAccountKindLabel(kind: AssetAccountKind): string {
  if (kind === "bank") return "銀行";
  if (kind === "emoney") return "電子マネー";
  return "その他";
}

export type PayslipLineDetail = {
  label: string;
  amount: number;
  section: "pay" | "deduction";
};

export type PayslipImport = {
  id: string;
  user_id: string;
  transaction_id: string | null;
  payday: string;
  target_label: string;
  filename: string | null;
  net_pay: number;
  gross_pay: number | null;
  deduction_total: number | null;
  details: PayslipLineDetail[];
  created_at: string;
  updated_at: string;
};

export type UserSettings = {
  user_id: string;
  payday_type: PaydayType;
  payday_day: number;
  updated_at: string;
};

export type CreditCard = {
  id: string;
  user_id: string;
  name: string;
  closing_day: number;
  payment_day: number;
  payment_month_offset: number;
  default_one_time_amount: number;
  default_installment_amount: number;
  asset_account_id?: string | null;
  created_at: string;
};

export type CreditCardPayment = {
  id: string;
  user_id: string;
  credit_card_id: string;
  payment_date: string;
  one_time_amount: number;
  installment_amount: number;
  note: string | null;
  created_at: string;
  updated_at: string;
  credit_cards?: Pick<CreditCard, "id" | "name"> | null;
};

export type Loan = {
  id: string;
  user_id: string;
  name: string;
  principal_amount: number;
  interest_amount: number;
  payment_day: number;
  start_date: string;
  end_date: string | null;
  asset_account_id?: string | null;
  created_at: string;
};

export type LoanPayment = {
  id: string;
  user_id: string;
  loan_id: string;
  payment_date: string;
  principal_amount: number;
  interest_amount: number;
  note: string | null;
  created_at: string;
  updated_at: string;
  loans?: Pick<Loan, "id" | "name"> | null;
};

/** Period starting on the payday of this calendar month (yyyy-MM). */
export type PeriodKey = `${number}-${string}`;

export type PeriodRange = {
  key: PeriodKey;
  start: string;
  end: string;
  payday: string;
  label: string;
};

export type CashflowRow = {
  period: PeriodRange;
  income: number;
  expenseOther: number;
  cardExpense: number;
  loanExpense: number;
  expense: number;
  net: number;
  endingBalance: number;
  projectedIncome: number;
  projectedExpense: number;
};

/** @deprecated use PeriodKey */
export type MonthKey = PeriodKey;

export type MonthSummary = {
  month: PeriodKey;
  income: number;
  expense: number;
  net: number;
  endingBalance: number;
  projectedIncome: number;
  projectedExpense: number;
};

/** 日々の小遣い・用途別支出（カレンダー月） */
export type DailySpendCategory = {
  id: string;
  user_id: string;
  name: string;
  monthly_budget: number;
  color: string;
  sort_order: number;
  created_at: string;
};

export type DailySpendEntry = {
  id: string;
  user_id: string;
  category_id: string;
  date: string;
  amount: number;
  /** ポイント決済額。月合計の参考表示のみ（予算・アラート・グラフ対象外） */
  points_amount: number;
  memo: string | null;
  created_at: string;
  updated_at: string;
  daily_spend_categories?: Pick<
    DailySpendCategory,
    "id" | "name" | "color" | "monthly_budget"
  > | null;
};

/** 個別予算を持ち、かつ「小遣い合計」の元になる用途 */
export const POCKET_BUDGET_NAMES = ["家族", "昼食", "雑費"] as const;

/** 小遣い合計枠から減る用途 */
export const POCKET_SPEND_NAMES = [
  "家族",
  "昼食",
  "雑費",
  "酒",
  "お菓子",
  "その他",
] as const;

/** 雑費予算の消化対象（雑費＋酒＋お菓子） */
export const MISC_GROUP_NAMES = ["雑費", "酒", "お菓子"] as const;

/** 独自予算なし・小遣い合計枠からだけ減る用途 */
export const SHARED_POOL_CATEGORY_NAMES = ["その他"] as const;

export const SHARED_POOL_CATEGORY_NAME = "その他";
export const MISC_BUDGET_NAME = "雑費";
export const LUNCH_CATEGORY_NAME = "昼食";
export const TRANSPORT_CATEGORY_NAME = "交通費";
export const CONFIDENTIAL_CATEGORY_NAME = "機密費";

/** これ以前（その月を含む）は作成時のおまけ固定予算。以降は DB の月予算（画面で編集可） */
export const LEGACY_POCKET_THROUGH_MONTH = "2026-07";

/** 2026年7月までの小遣い固定予算（履歴用・編集不可） */
export const LEGACY_POCKET_BUDGETS: Record<
  (typeof POCKET_BUDGET_NAMES)[number],
  number
> = {
  家族: 35000,
  昼食: 15000,
  雑費: 10000,
};

/** 本機能の初期予算（2026-08〜 / DB に保存・編集可） */
export const DEFAULT_POCKET_BUDGETS: Record<
  (typeof POCKET_BUDGET_NAMES)[number],
  number
> = {
  家族: 35000,
  昼食: 19000,
  雑費: 10000,
};

export type DailySpendHoliday = {
  id: string;
  user_id: string;
  date: string;
  note: string | null;
  created_at: string;
};

/** マキコ休み（カレンダー印。昼食の平日数には影響しない） */
export type DailySpendMakikoOff = {
  id: string;
  user_id: string;
  date: string;
  note: string | null;
  created_at: string;
};

export type DailyScratchpad = {
  id: string;
  user_id: string;
  month_key: string;
  body: string;
  created_at: string;
  updated_at: string;
};

/** Suica 残高スナップショット（登録時点を正とし、以降の交通費で減らす） */
export type SuicaBalanceSnapshot = {
  id: string;
  user_id: string;
  as_of_date: string;
  balance: number;
  note: string | null;
  created_at: string;
};

export type SuicaDisplayBalance = {
  /** 推定残高（未登録時は null） */
  balance: number | null;
  asOf: string | null;
  snapshotBalance: number | null;
  /** 登録日より後の交通費合計 */
  spentAfter: number;
};

export type LunchMenuItem = {
  id: string;
  user_id: string;
  store_name: string;
  item_name: string;
  amount: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export function isSharedPoolCategory(name: string): boolean {
  return (SHARED_POOL_CATEGORY_NAMES as readonly string[]).includes(name);
}

export function isMiscGroupCategory(name: string): boolean {
  return (MISC_GROUP_NAMES as readonly string[]).includes(name);
}

/** 酒・お菓子（雑費予算の子用途） */
export function isMiscGroupChild(name: string): boolean {
  return name === "酒" || name === "お菓子";
}

export function isPocketBudgetCategory(name: string): boolean {
  return (POCKET_BUDGET_NAMES as readonly string[]).includes(name);
}

export function isPocketSpendCategory(name: string): boolean {
  return (POCKET_SPEND_NAMES as readonly string[]).includes(name);
}

export function isLunchCategory(name: string): boolean {
  return name === LUNCH_CATEGORY_NAME;
}

export function isTransportCategory(name: string): boolean {
  return name === TRANSPORT_CATEGORY_NAME;
}

export function isConfidentialCategory(name: string): boolean {
  return name === CONFIDENTIAL_CATEGORY_NAME;
}

/** 月合計・小遣い・グラフ・カレンダー日計から除外する用途 */
export function isExcludedFromMonthTotalCategory(name: string): boolean {
  return isTransportCategory(name) || isConfidentialCategory(name);
}

export function isLegacyPocketMonth(monthKey: string): boolean {
  return monthKey <= LEGACY_POCKET_THROUGH_MONTH;
}

/**
 * 表示月の予算。
 * - 家族/昼食/雑費かつ 〜2026-07: 固定のおまけ予算
 * - それ以外（8月以降の小遣い・交通費など）: DB の monthly_budget（画面で編集）
 */
export function resolveCategoryBudget(
  name: string,
  monthKey: string,
  fallback: number,
): number {
  if (isPocketBudgetCategory(name) && isLegacyPocketMonth(monthKey)) {
    return (
      LEGACY_POCKET_BUDGETS[name as (typeof POCKET_BUDGET_NAMES)[number]] ??
      fallback
    );
  }
  return fallback;
}

/**
 * 昼食の一日上限用: 月内の平日数（土日を除く）から、会社都合の休日を引く。
 */
export function countWorkingWeekdaysInMonth(
  monthKey: string,
  holidayDates: Iterable<string>,
): number {
  return countRemainingWorkingWeekdaysInMonth(
    monthKey,
    holidayDates,
    `${monthKey}-01`,
  );
}

/**
 * 昼食の一日上限用: asOfDate（含む）から月末までの残り平日数。
 * 土日と会社都合の休日を除く。
 * asOf が対象月より前なら月初から、より後なら 0。
 */
export function countRemainingWorkingWeekdaysInMonth(
  monthKey: string,
  holidayDates: Iterable<string>,
  asOfDate: string,
): number {
  const holidays = new Set(holidayDates);
  const [y, m] = monthKey.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const asOfMonth = asOfDate.slice(0, 7);
  let startDay = 1;
  if (asOfMonth > monthKey) return 0;
  if (asOfMonth === monthKey) {
    startDay = Number(asOfDate.slice(8, 10));
    if (!Number.isFinite(startDay) || startDay < 1) startDay = 1;
    if (startDay > lastDay) return 0;
  }
  let count = 0;
  for (let day = startDay; day <= lastDay; day++) {
    const date = new Date(y, m - 1, day);
    const dow = date.getDay(); // 0 Sun .. 6 Sat
    if (dow === 0 || dow === 6) continue;
    const key = `${monthKey}-${String(day).padStart(2, "0")}`;
    if (holidays.has(key)) continue;
    count += 1;
  }
  return count;
}

/** 昼食残額 ÷ 残り平日数（1円未満切り捨て）。平日0日なら null */
export function lunchDailyLimit(
  remaining: number,
  weekdayCount: number,
): number | null {
  if (weekdayCount <= 0) return null;
  return Math.floor(remaining / weekdayCount);
}
