import type {
  DailySpendCategory,
  DailySpendEntry,
  DailySpendHoliday,
} from "@/lib/types";
import {
  countRemainingWorkingWeekdaysInMonth,
  isConfidentialCategory,
  isExcludedFromMonthTotalCategory,
  isLunchCategory,
  isMiscGroupCategory,
  isPocketBudgetCategory,
  isPocketSpendCategory,
  isSharedPoolCategory,
  isTransportCategory,
  lunchDailyLimit,
  MISC_BUDGET_NAME,
  resolveCategoryBudget,
} from "@/lib/types";
import { todayKeyInTimeZone, APP_TIME_ZONE } from "@/lib/dates";

function exportAsOfDate(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIME_ZONE }).format(
    d,
  );
}

export function monthBounds(monthKey: string): { start: string; end: string } {
  const [y, m] = monthKey.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return {
    start: `${monthKey}-01`,
    end: `${monthKey}-${String(lastDay).padStart(2, "0")}`,
  };
}

export type DailySpendCategorySummary = {
  id: string;
  name: string;
  color: string;
  budget: number;
  spent: number;
  remaining: number;
  shared: boolean;
  lunchDaily: number | null;
};

export type DailySpendExportModel = {
  monthKey: string;
  start: string;
  end: string;
  label: string; // 2026年7月
  generatedAt: string; // ISO date yyyy-MM-dd
  categories: DailySpendCategorySummary[];
  pocketBudgetTotal: number;
  pocketSpentTotal: number;
  pocketRemaining: number;
  weekdayCount: number;
  holidays: string[];
  /** 交通費を除く月合計（画面・CSV向け） */
  monthTotal: number;
  transportTotal: number;
  /** 交通費を含む総額（PDF提出向け） */
  grandTotal: number;
  entryCount: number;
  entryCountAll: number;
  entries: {
    date: string;
    category: string;
    amount: number;
    memo: string;
  }[];
  dailyTotals: { date: string; total: number; count: number }[];
};

export function buildDailySpendExportModel(
  monthKey: string,
  categories: DailySpendCategory[],
  entries: DailySpendEntry[],
  holidays: DailySpendHoliday[] = [],
  generatedAt = new Date(),
): DailySpendExportModel {
  const { start, end } = monthBounds(monthKey);
  const [y, m] = monthKey.split("-").map(Number);
  const label = `${y}年${m}月`;
  const holidayDates = holidays.map((h) => h.date);
  const weekdayCount = countRemainingWorkingWeekdaysInMonth(
    monthKey,
    holidayDates,
    exportAsOfDate(generatedAt),
  );

  const spentByCategoryId = new Map<string, number>();
  for (const e of entries) {
    spentByCategoryId.set(
      e.category_id,
      (spentByCategoryId.get(e.category_id) ?? 0) + e.amount,
    );
  }

  const miscSpent = categories
    .filter((c) => isMiscGroupCategory(c.name))
    .reduce((s, c) => s + (spentByCategoryId.get(c.id) ?? 0), 0);

  const categorySummaries: DailySpendCategorySummary[] = categories.map(
    (c) => {
      const spentAlone = spentByCategoryId.get(c.id) ?? 0;
      const budget = resolveCategoryBudget(c.name, monthKey, c.monthly_budget);
      const spent = c.name === MISC_BUDGET_NAME ? miscSpent : spentAlone;
      const remaining = budget - spent;
      return {
        id: c.id,
        name: c.name,
        color: c.color,
        budget,
        spent,
        remaining,
        shared: isSharedPoolCategory(c.name),
        lunchDaily: isLunchCategory(c.name)
          ? lunchDailyLimit(remaining, weekdayCount)
          : null,
      };
    },
  );

  const pocketBudgetTotal = categories
    .filter((c) => isPocketBudgetCategory(c.name))
    .reduce(
      (s, c) => s + resolveCategoryBudget(c.name, monthKey, c.monthly_budget),
      0,
    );
  const pocketSpentTotal = categories
    .filter((c) => isPocketSpendCategory(c.name))
    .reduce((s, c) => s + (spentByCategoryId.get(c.id) ?? 0), 0);

  const sorted = [...entries].sort((a, b) =>
    a.date === b.date
      ? a.created_at.localeCompare(b.created_at)
      : a.date.localeCompare(b.date),
  );

  const dailyMap = new Map<string, { total: number; count: number }>();
  for (const e of sorted) {
    const cur = dailyMap.get(e.date) ?? { total: 0, count: 0 };
    cur.total += e.amount;
    cur.count += 1;
    dailyMap.set(e.date, cur);
  }

  const nonExcludedEntries = sorted.filter(
    (e) =>
      !isExcludedFromMonthTotalCategory(
        e.daily_spend_categories?.name ?? "",
      ),
  );
  const transportTotal = sorted
    .filter((e) => isTransportCategory(e.daily_spend_categories?.name ?? ""))
    .reduce((s, e) => s + e.amount, 0);
  const confidentialTotal = sorted
    .filter((e) => isConfidentialCategory(e.daily_spend_categories?.name ?? ""))
    .reduce((s, e) => s + e.amount, 0);

  const monthTotal = nonExcludedEntries.reduce((s, e) => s + e.amount, 0);

  return {
    monthKey,
    start,
    end,
    label,
    generatedAt: generatedAt.toISOString().slice(0, 10),
    categories: categorySummaries,
    pocketBudgetTotal,
    pocketSpentTotal,
    pocketRemaining: pocketBudgetTotal - pocketSpentTotal,
    weekdayCount,
    holidays: holidayDates,
    monthTotal,
    transportTotal,
    grandTotal: monthTotal + transportTotal + confidentialTotal,
    entryCount: nonExcludedEntries.length,
    entryCountAll: sorted.length,
    entries: sorted.map((e) => ({
      date: e.date,
      category: e.daily_spend_categories?.name ?? "用途不明",
      amount: e.amount,
      memo: e.memo ?? "",
    })),
    dailyTotals: [...dailyMap.entries()].map(([date, v]) => ({
      date,
      total: v.total,
      count: v.count,
    })),
  };
}
