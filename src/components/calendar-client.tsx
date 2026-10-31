"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ja } from "date-fns/locale";
import {
  createDailySpendEntry,
  deleteDailySpendEntry,
  setDailySpendHoliday,
  setDailySpendMakikoOff,
  updateDailySpendCategory,
  updateDailySpendEntry,
} from "@/app/actions";
import { AccountBalanceStrip } from "@/components/account-balance-strip";
import { EditPopover } from "@/components/edit-popover";
import {
  defaultAccountId,
  PaymentSourceField,
} from "@/components/payment-source-field";
import { ScheduledRulesPanel } from "@/components/scheduled-rules-panel";
import type { AccountBalanceView } from "@/lib/account-display";
import { formatYen } from "@/lib/money";
import {
  buildMonthPaceWeights,
  expectedRemainingByWeight,
  paceToneFromGap,
  type PaceTone,
} from "@/lib/daily-spend-pace";
import {
  defaultSelectedDateForMonth,
  monthKeyInTimeZone,
  todayKeyInTimeZone,
} from "@/lib/dates";
import { periodNavButtonClassName } from "@/components/month-nav";
import type {
  AssetAccount,
  DailySpendCategory,
  DailySpendEntry,
  DailySpendHoliday,
  DailySpendMakikoOff,
  ScheduledRule,
} from "@/lib/types";
import {
  countRemainingWorkingWeekdaysInMonth,
  isConfidentialCategory,
  isExcludedFromMonthTotalCategory,
  isFixedCostCategory,
  isIncomeEntry,
  isLegacyPocketMonth,
  isLunchCategory,
  isMiscGroupCategory,
  isMiscGroupChild,
  isPocketBudgetCategory,
  isPocketSpendCategory,
  isSharedPoolCategory,
  isTransportCategory,
  lunchDailyLimit,
  MISC_BUDGET_NAME,
  resolveCategoryBudget,
} from "@/lib/types";
import { DailySpendCategoryList } from "@/components/daily-spend-category-list";
import { DailySpendCharts } from "@/components/daily-spend-charts";
import { ScratchpadPanel } from "@/components/scratchpad-panel";

type ViewMode = "calendar" | "list";

type Props = {
  monthKey: string; // yyyy-MM
  categories: DailySpendCategory[];
  entries: DailySpendEntry[];
  compareMonth: string;
  compareEntries: DailySpendEntry[];
  holidays: DailySpendHoliday[];
  makikoOffs: DailySpendMakikoOff[];
  selectedDate: string;
  view: ViewMode;
  listCategoryId: string;
  scratchpadBody: string;
  accounts: AssetAccount[];
  balances: AccountBalanceView[];
  rules: ScheduledRule[];
  scheduleError: string | null;
  /** 今日を含む暦月の記録。翌月以降は含まない */
  remainderEntries: DailySpendEntry[];
  remainderLabel: string;
};

function calUrl(
  monthKey: string,
  opts: { view?: ViewMode; date?: string; category?: string; compare?: string },
): string {
  const p = new URLSearchParams({ month: monthKey });
  if (opts.compare) p.set("compare", opts.compare);
  if (opts.view === "list") {
    p.set("view", "list");
    if (opts.category) p.set("category", opts.category);
  } else if (opts.date) {
    p.set("date", opts.date);
  }
  return `/calendar?${p.toString()}`;
}

function ProjectedRemainder({
  balances,
  remainderEntries,
  remainderLabel,
  today,
}: {
  balances: AccountBalanceView[];
  remainderEntries: DailySpendEntry[];
  remainderLabel: string;
  today: string;
}) {
  const yen = (value: unknown) => {
    const n = typeof value === "number" ? value : Number(value);
    return Number.isFinite(n) ? n : 0;
  };
  const known = balances.filter((b) => b.balance != null && Number.isFinite(yen(b.balance)));
  const actual = known.reduce((s, b) => s + yen(b.balance), 0);
  const baseline = known.reduce((s, b) => s + yen(b.baseline), 0);
  const appliedIncome = known.reduce((s, b) => s + yen(b.appliedIncome), 0);
  const appliedExpense = known.reduce((s, b) => s + yen(b.appliedExpense), 0);
  const entries = remainderEntries ?? [];
  const monthKey = today.slice(0, 7);
  const [year, month] = monthKey.split("-").map(Number);
  const monthEnd = `${monthKey}-${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, "0")}`;
  const inThisMonth = (date: string) => date >= `${monthKey}-01` && date <= monthEnd;
  const periodIncome = entries.reduce(
    (s, e) => (inThisMonth(e.date) && isIncomeEntry(e) ? s + yen(e.amount) : s),
    0,
  );
  const periodExpense = entries.reduce(
    (s, e) => (inThisMonth(e.date) && !isIncomeEntry(e) ? s + yen(e.amount) : s),
    0,
  );
  const upcomingIncome = entries.reduce(
    (s, e) =>
      e.date > today && inThisMonth(e.date) && isIncomeEntry(e) ? s + yen(e.amount) : s,
    0,
  );
  const upcomingExpense = entries.reduce(
    (s, e) =>
      e.date > today && inThisMonth(e.date) && !isIncomeEntry(e) ? s + yen(e.amount) : s,
    0,
  );
  const projected = actual + upcomingIncome - upcomingExpense;

  return (
    <section className="rounded-xl border border-line/80 bg-surface p-4">
      <p className="text-xs uppercase tracking-wide text-muted">
        総資産
        <span className="ml-1 text-[10px] font-normal normal-case tracking-normal">
          （今月予定残金）
        </span>
      </p>
      <p className="mt-1 text-xs text-muted">
        {remainderLabel}（この月の1日〜末日。翌月以降の予定は入れない）
      </p>
      <p
        className={`mt-2 text-2xl font-bold tabular-nums ${
          known.length === 0 ? "text-muted" : projected < 0 ? "text-expense" : ""
        }`}
      >
        {known.length === 0 ? "未登録" : formatYen(projected)}
      </p>
      <p className="mt-2 text-sm tabular-nums text-muted">
        いまの総資産 {known.length === 0 ? "未登録" : formatYen(actual)}
        {" ＋ "}
        今日より後〜月末の収入 {formatYen(upcomingIncome)}
        {" − "}
        今日より後〜月末の支出 {formatYen(upcomingExpense)}
      </p>
      <p className="mt-1 text-xs text-muted">
        手入力の合計 {formatYen(baseline)} ＋ 今日までの収入 {formatYen(appliedIncome)} −
        今日までの支出 {formatYen(appliedExpense)} ＝ いまの総資産。この月の総収入{" "}
        {formatYen(periodIncome)} / 総支出 {formatYen(periodExpense)}。
        各口座の金額は手入力が正です。残金に足すのは、今日より後で今月末までの記録だけです。
      </p>
    </section>
  );
}

export function CalendarClient({
  monthKey,
  categories,
  entries,
  compareMonth,
  compareEntries,
  holidays,
  makikoOffs,
  selectedDate,
  view,
  listCategoryId,
  scratchpadBody,
  accounts,
  balances,
  rules,
  scheduleError,
  remainderEntries,
  remainderLabel,
}: Props) {
  const router = useRouter();
  const monthDate = parseISO(`${monthKey}-01`);
  const todayStr = todayKeyInTimeZone();
  const todayMonth = monthKeyInTimeZone();
  const prev = format(addMonths(monthDate, -1), "yyyy-MM");
  const next = format(addMonths(monthDate, 1), "yyyy-MM");
  const defaultDateForMonth = (key: string) => defaultSelectedDateForMonth(key);

  const holidaySet = useMemo(
    () => new Set(holidays.map((h) => h.date)),
    [holidays],
  );
  const makikoSet = useMemo(
    () => new Set(makikoOffs.map((m) => m.date)),
    [makikoOffs],
  );

  const excludedCategoryIds = useMemo(
    () =>
      new Set(
        categories
          .filter((c) => isExcludedFromMonthTotalCategory(c.name))
          .map((c) => c.id),
      ),
    [categories],
  );

  const fixedCategoryIds = useMemo(
    () =>
      new Set(
        categories.filter((c) => isFixedCostCategory(c.name)).map((c) => c.id),
      ),
    [categories],
  );

  const dayTotals = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of entries) {
      if (isIncomeEntry(e) || !e.category_id) continue;
      if (excludedCategoryIds.has(e.category_id)) continue;
      if (fixedCategoryIds.has(e.category_id)) continue;
      map.set(e.date, (map.get(e.date) ?? 0) + e.amount);
    }
    return map;
  }, [entries, excludedCategoryIds, fixedCategoryIds]);

  const dayCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of entries) {
      if (isIncomeEntry(e) || !e.category_id) continue;
      if (excludedCategoryIds.has(e.category_id)) continue;
      if (fixedCategoryIds.has(e.category_id)) continue;
      map.set(e.date, (map.get(e.date) ?? 0) + 1);
    }
    return map;
  }, [entries, excludedCategoryIds, fixedCategoryIds]);

  const spentByCategoryId = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of entries) {
      if (isIncomeEntry(e) || !e.category_id) continue;
      map.set(e.category_id, (map.get(e.category_id) ?? 0) + e.amount);
    }
    return map;
  }, [entries]);

  const transportCategoryId = categories.find((c) =>
    isTransportCategory(c.name),
  )?.id;
  const transportTotal = transportCategoryId
    ? (spentByCategoryId.get(transportCategoryId) ?? 0)
    : 0;
  const paceExcludedIds = useMemo(() => {
    const ids = new Set(excludedCategoryIds);
    for (const c of categories) {
      if (isFixedCostCategory(c.name)) ids.add(c.id);
    }
    return ids;
  }, [categories, excludedCategoryIds]);

  const incomeLines = entries
    .filter((e) => isIncomeEntry(e))
    .slice()
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        (a.memo ?? "").localeCompare(b.memo ?? "", "ja"),
    );
  const monthIncome = incomeLines.reduce((s, e) => s + e.amount, 0);
  const monthExpenseAll = entries.reduce((s, e) => {
    if (isIncomeEntry(e)) return s;
    return s + e.amount;
  }, 0);
  const monthTotal = entries.reduce((s, e) => {
    if (isIncomeEntry(e) || !e.category_id) return s;
    if (paceExcludedIds.has(e.category_id)) return s;
    return s + e.amount;
  }, 0);
  const monthEntryCount = entries.filter((e) => {
    if (isIncomeEntry(e) || !e.category_id) return false;
    return !paceExcludedIds.has(e.category_id);
  }).length;

  const monthPointsTotal = entries.reduce(
    (s, e) => s + (e.points_amount ?? 0),
    0,
  );
  const weekdayCount = countRemainingWorkingWeekdaysInMonth(
    monthKey,
    holidaySet,
    todayStr,
  );

  const miscSpent = categories
    .filter((c) => isMiscGroupCategory(c.name))
    .reduce((s, c) => s + (spentByCategoryId.get(c.id) ?? 0), 0);

  const categoryStats = categories.map((c) => {
    const spentAlone = spentByCategoryId.get(c.id) ?? 0;
    const budget = resolveCategoryBudget(c.name, monthKey, c.monthly_budget);
    const isMiscParent = c.name === MISC_BUDGET_NAME;
    const spent = isMiscParent ? miscSpent : spentAlone;
    const remaining = budget - spent;
    const lunch = isLunchCategory(c.name);
    return {
      ...c,
      monthly_budget: budget,
      spent,
      remaining,
      shared: isSharedPoolCategory(c.name),
      miscChild: isMiscGroupChild(c.name),
      lunch,
      lunchDaily: lunch ? lunchDailyLimit(remaining, weekdayCount) : null,
    };
  });

  const pocketBudgetCats = categories.filter((c) =>
    isPocketBudgetCategory(c.name),
  );
  const pocketSpendCats = categories.filter((c) =>
    isPocketSpendCategory(c.name),
  );
  const pocketBudgetTotal = pocketBudgetCats.reduce(
    (s, c) => s + resolveCategoryBudget(c.name, monthKey, c.monthly_budget),
    0,
  );
  const pocketSpentTotal = pocketSpendCats.reduce(
    (s, c) => s + (spentByCategoryId.get(c.id) ?? 0),
    0,
  );
  const pocketRemaining = pocketBudgetTotal - pocketSpentTotal;
  const otherSpent =
    spentByCategoryId.get(
      categories.find((c) => isSharedPoolCategory(c.name))?.id ?? "",
    ) ?? 0;
  const dayPaceTones = useMemo(() => {
    const [y, m] = monthKey.split("-").map(Number);
    const lastDay = new Date(y, m, 0).getDate();

    const nonExcludedByDate = new Map<string, number>();
    for (const e of entries) {
      if (isIncomeEntry(e) || !e.category_id) continue;
      if (paceExcludedIds.has(e.category_id)) continue;
      nonExcludedByDate.set(
        e.date,
        (nonExcludedByDate.get(e.date) ?? 0) + e.amount,
      );
    }

    const paceWeights = buildMonthPaceWeights(monthKey, holidaySet, makikoSet);
    const tones = new Map<string, PaceTone>();
    let cumulative = 0;
    for (let d = 1; d <= lastDay; d++) {
      const key = `${monthKey}-${String(d).padStart(2, "0")}`;
      cumulative += nonExcludedByDate.get(key) ?? 0;
      const remaining = pocketBudgetTotal - cumulative;
      const expectedRemaining = expectedRemainingByWeight(
        pocketBudgetTotal,
        paceWeights.cumulativeThrough[d - 1] ?? 0,
        paceWeights.totalWeight,
      );
      const gap = remaining - expectedRemaining;
      tones.set(key, paceToneFromGap(gap, pocketBudgetTotal, remaining));
    }
    return tones;
  }, [
    entries,
    paceExcludedIds,
    monthKey,
    pocketBudgetTotal,
    holidaySet,
    makikoSet,
  ]);

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(monthDate), { weekStartsOn: 0 }),
    end: endOfWeek(endOfMonth(monthDate), { weekStartsOn: 0 }),
  });

  const dayEntries = entries.filter((e) => e.date === selectedDate);
  const selectedIsHoliday = holidaySet.has(selectedDate);
  const selectedIsMakikoOff = makikoSet.has(selectedDate);
  const activeListCategoryId =
    categories.find((c) => c.id === listCategoryId)?.id ??
    categories[0]?.id ??
    "";

  return (
    <div className="grid gap-6">
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 sm:gap-4">
        <Link
          href={
            view === "list"
              ? calUrl(prev, {
                  view: "list",
                  category: activeListCategoryId,
                  compare: compareMonth,
                })
              : calUrl(prev, {
                  date: defaultDateForMonth(prev),
                  compare: compareMonth,
                })
          }
          aria-label="前月へ"
          className={periodNavButtonClassName}
        >
          ← 前月
        </Link>
        <div className="min-w-0 overflow-hidden text-center">
          <h1 className="pointer-events-none truncate text-xl font-bold tracking-tight sm:text-2xl">
            {format(monthDate, "yyyy年M月", { locale: ja })}
          </h1>
          {monthKey === todayMonth && selectedDate !== todayStr ? (
            <p className="mt-1">
              <Link
                href={calUrl(monthKey, { date: todayStr, compare: compareMonth })}
                className="text-xs text-accent hover:underline"
              >
                今日（{todayStr}）へ
              </Link>
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
            <a
              href={`/api/export/daily/csv?month=${monthKey}`}
              className="rounded-md border border-line bg-white/80 px-3 py-1.5 text-xs text-muted hover:text-ink"
            >
              CSV出力
            </a>
            <a
              href={`/api/export/daily/pdf?month=${monthKey}`}
              className="rounded-md border border-line bg-white/80 px-3 py-1.5 text-xs text-muted hover:text-ink"
            >
              PDF出力（明細書）
            </a>
          </div>
        </div>
        <Link
          href={
            view === "list"
              ? calUrl(next, {
                  view: "list",
                  category: activeListCategoryId,
                  compare: compareMonth,
                })
              : calUrl(next, {
                  date: defaultDateForMonth(next),
                  compare: compareMonth,
                })
          }
          aria-label="翌月へ"
          className={periodNavButtonClassName}
        >
          翌月 →
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href={calUrl(monthKey, { date: selectedDate, compare: compareMonth })}
          className={`rounded-md border px-4 py-2 text-sm ${
            view === "calendar"
              ? "border-accent bg-accent text-white"
              : "border-line bg-white/80 text-muted hover:text-ink"
          }`}
        >
          カレンダー
        </Link>
        <Link
          href={calUrl(monthKey, {
            view: "list",
            category: activeListCategoryId,
            compare: compareMonth,
          })}
          className={`rounded-md border px-4 py-2 text-sm ${
            view === "list"
              ? "border-accent bg-accent text-white"
              : "border-line bg-white/80 text-muted hover:text-ink"
          }`}
        >
          用途別一覧
        </Link>
        <form action="/calendar" className="flex items-center gap-2">
          <input type="hidden" name="month" value={monthKey} />
          {view === "list" ? <input type="hidden" name="view" value="list" /> : null}
          {view === "list" ? (
            <input type="hidden" name="category" value={activeListCategoryId} />
          ) : (
            <input type="hidden" name="date" value={selectedDate} />
          )}
          <label className="text-xs text-muted">比較月</label>
          <input
            type="month"
            name="compare"
            min="2026-08"
            defaultValue={compareMonth}
            className="rounded-md border border-line bg-white px-2 py-1.5 text-xs"
          />
          <button
            type="submit"
            className="rounded-md border border-line bg-white/80 px-3 py-1.5 text-xs text-muted hover:text-ink"
          >
            比較
          </button>
        </form>
        {compareMonth ? (
          <Link
            href={calUrl(monthKey, {
              view,
              date: selectedDate,
              category: activeListCategoryId,
            })}
            className="rounded-md border border-line bg-white/80 px-3 py-2 text-xs text-muted hover:text-ink"
          >
            比較解除
          </Link>
        ) : null}
      </div>

      <AccountBalanceStrip balances={balances} />

      <ProjectedRemainder
        balances={balances}
        remainderEntries={remainderEntries}
        remainderLabel={remainderLabel}
        today={todayStr}
      />

      <section className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-income/30 bg-income/10 p-4">
            <p className="text-xs uppercase tracking-wide text-muted">総収入</p>
            <p className="mt-2 text-2xl font-bold tabular-nums text-income">
              {formatYen(monthIncome)}
            </p>
            <p className="mt-1 text-xs text-muted">
              表示中の月の収入行を足した金額です
            </p>
            {incomeLines.length > 0 ? (
              <ul className="mt-2 max-h-36 space-y-1 overflow-y-auto text-xs text-muted">
                {incomeLines.map((line) => (
                  <li key={line.id} className="flex justify-between gap-2">
                    <span className="min-w-0 truncate">
                      {line.date.slice(5).replace("-", "/")}{" "}
                      {line.memo || "収入"}
                    </span>
                    <span className="shrink-0 tabular-nums text-income">
                      {formatYen(line.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <div className="rounded-xl border border-expense/35 bg-expense/10 p-4">
            <p className="text-xs uppercase tracking-wide text-muted">総支出</p>
            <p className="mt-2 text-2xl font-bold tabular-nums text-expense">
              {formatYen(monthExpenseAll)}
            </p>
            <p className="mt-1 text-xs text-muted">
              交通費・固定費を含むこの月の支出
            </p>
          </div>
          <div className="rounded-xl border border-accent/40 bg-accent/10 p-4">
            <p className="text-xs uppercase tracking-wide text-muted">
              小遣い残り（家族＋昼食＋雑費）
            </p>
            <p className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span
                className={`text-2xl font-bold tabular-nums ${
                  pocketRemaining < 0 ? "text-expense" : "text-income"
                }`}
              >
                {formatYen(pocketRemaining)}
              </span>
            </p>
            <p className="mt-1 text-xs text-muted">
              予算合計 {formatYen(pocketBudgetTotal)} − 使用{" "}
              {formatYen(pocketSpentTotal)}
              {otherSpent > 0
                ? `（うちその他 ${formatYen(otherSpent)}）`
                : ""}
            </p>
          </div>
          <div className="rounded-xl border border-expense/35 bg-expense/10 p-4">
            <p className="text-xs uppercase tracking-wide text-muted">月の合計支出</p>
            <p className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-2xl font-bold tabular-nums text-expense">
                {formatYen(monthTotal)}
              </span>
              <span className="text-sm tabular-nums text-muted">
                交通費 {formatYen(transportTotal)}
              </span>
            </p>
            <p className="mt-1 text-sm tabular-nums text-muted">
              ポイント決済 {formatYen(monthPointsTotal)}
              <span className="ml-1 text-xs">（参考・予算外）</span>
            </p>
            <p className="mt-1 text-xs text-muted">
              {monthEntryCount} 件 · 交通費・固定費を除く小遣いの合計
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {categoryStats
            .filter(
              (c) =>
                !isConfidentialCategory(c.name) && !isFixedCostCategory(c.name),
            )
            .map((c) => (
            <div
              key={c.id}
              className="rounded-xl border border-line/80 bg-surface p-4"
            >
              <div className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: c.color }}
                />
                <p className="flex-1 text-xs uppercase tracking-wide text-muted">
                  {c.name}
                </p>
                {!c.shared && !c.miscChild ? (
                  <EditPopover title={`${c.name}の月予算`}>
                    <BudgetPopup
                      category={
                        categories.find((cat) => cat.id === c.id) ?? c
                      }
                      monthKey={monthKey}
                    />
                  </EditPopover>
                ) : null}
              </div>
              {c.shared ? (
                <>
                  <p className="mt-2 text-2xl font-bold tabular-nums text-expense">
                    {formatYen(c.spent)}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    家族＋昼食＋雑費の合計枠から減算（独自予算なし）
                  </p>
                </>
              ) : c.miscChild ? (
                <>
                  <p className="mt-2 text-2xl font-bold tabular-nums text-expense">
                    {formatYen(c.spent)}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    雑費予算から減算（酒＋お菓子＋雑費で合算）
                  </p>
                </>
              ) : (
                <>
                  <p
                    className={`mt-2 text-2xl font-bold tabular-nums ${
                      c.remaining < 0 ? "text-expense" : "text-income"
                    }`}
                  >
                    {c.remaining < 0
                      ? `超過 ${formatYen(Math.abs(c.remaining))}`
                      : formatYen(c.remaining)}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    予算 {formatYen(c.monthly_budget)} − 使用{" "}
                    {formatYen(c.spent)}
                    {c.name === MISC_BUDGET_NAME
                      ? "（雑費＋酒＋お菓子）"
                      : ""}
                  </p>
                  {c.lunch ? (
                    <p className="mt-2 rounded-md bg-white/70 px-2 py-1.5 text-xs text-ink">
                      残り平日 {weekdayCount} 日
                      {c.lunchDaily == null ? (
                        " · 一日上限を算出できません"
                      ) : (
                        <>
                          {" "}
                          · 一日上限{" "}
                          <span className="font-semibold tabular-nums">
                            {formatYen(c.lunchDaily)}
                          </span>
                          <span className="text-muted">
                            （残÷残平日・切捨て）
                          </span>
                        </>
                      )}
                    </p>
                  ) : null}
                </>
              )}
            </div>
          ))}
        </div>

      </section>

      <ScheduledRulesPanel
        rules={rules}
        accounts={accounts}
        categories={categories}
        loadError={scheduleError}
        monthKey={monthKey}
        occurrences={entries.filter((entry) => entry.scheduled_rule_id)}
      />

      <DailySpendCharts
        monthKey={monthKey}
        categories={categories}
        entries={entries}
        holidayDates={holidays.map((h) => h.date)}
        makikoOffDates={makikoOffs.map((m) => m.date)}
        compareMonth={compareMonth}
        compareEntries={compareEntries}
      />

      {view === "list" ? (
        <DailySpendCategoryList
          monthKey={monthKey}
          categories={categories.filter((c) => !isConfidentialCategory(c.name))}
          entries={entries}
          categoryId={activeListCategoryId}
          accounts={accounts}
        />
      ) : (
      <div className="grid items-start gap-6 lg:grid-cols-[1.35fr_1fr]">
        <div className="grid gap-4">
          <div className="overflow-hidden rounded-xl border border-line/80 bg-surface">
          <div className="flex flex-wrap items-center gap-2 border-b border-line/70 bg-white/70 px-2 py-1.5 text-[10px] text-muted">
            <span className="rounded border border-[#d97706] bg-[#fffbeb] px-1 py-0.5 font-semibold text-[#b45309]">
              注意
            </span>
            <span className="rounded-full border border-dashed border-[#0f766e] bg-[#ecfdf5] px-1.5 py-0.5 font-semibold text-[#0f766e]">
              注意
            </span>
            <span>目安よりやや速い（丸枠＝土日・会社休日）</span>
            <span className="rounded bg-[#ea580c] px-1 py-0.5 font-semibold text-white">
              警戒
            </span>
            <span className="rounded-full border-2 border-[#9a3412] bg-[#fff7ed] px-1.5 py-0.5 font-semibold text-[#9a3412]">
              警戒
            </span>
            <span>目安より速い（丸枠＝土日・会社休日）</span>
            <span className="rounded bg-[#7f1d1d] px-1 py-0.5 font-semibold text-white">
              赤字
            </span>
            <span className="rounded-full border-2 border-[#7f1d1d] bg-[#fef2f2] px-1.5 py-0.5 font-semibold text-[#7f1d1d]">
              赤字
            </span>
            <span>小遣い超過（丸枠＝土日・会社休日）</span>
            <span
              className="inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-[2px] bg-accent/20 text-[9px] font-bold leading-none text-accent-deep"
              title="マキコ休み"
            >
              マ
            </span>
            <span>マキコ休み</span>
            <span className="text-[10px] text-muted">
              ※ペース目安は「マ」×会社休日（土日または平日の休）の重なりを多めに見ます
            </span>
          </div>
          <div className="grid grid-cols-7 border-b border-line/70 bg-[#eef5f3] text-center text-[11px] font-medium text-muted">
            {["日", "月", "火", "水", "木", "金", "土"].map((d) => (
              <div key={d} className="px-1 py-2">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const inMonth = isSameMonth(day, monthDate);
              const total = dayTotals.get(key) ?? 0;
              const selected = key === selectedDate;
              const count = dayCounts.get(key) ?? 0;
              const isCompanyHoliday = holidaySet.has(key);
              const isMakikoOff = makikoSet.has(key);
              const isWeekend = day.getDay() === 0 || day.getDay() === 6;
              const holidayStyleBadge = isWeekend || isCompanyHoliday;
              const paceTone = dayPaceTones.get(key) ?? "ok";
              const showPaceBadge = inMonth && paceTone !== "ok";
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() =>
                    router.push(calUrl(monthKey, { date: key, compare: compareMonth }))
                  }
                  className={`min-h-[4.5rem] border-b border-r border-line/40 px-1.5 py-1.5 text-left transition ${
                    selected ? "bg-accent/10 ring-1 ring-inset ring-accent/40" : ""
                  } ${
                    inMonth
                      ? isCompanyHoliday
                        ? "bg-[#fff1f2] hover:bg-[#ffe4e6]"
                        : "bg-white/50 hover:bg-white"
                      : "bg-transparent opacity-40"
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <div
                      className={`text-xs ${
                        day.getDay() === 0 || isCompanyHoliday
                          ? "text-expense"
                          : day.getDay() === 6
                            ? "text-accent"
                            : "text-muted"
                      }`}
                    >
                      {format(day, "d")}
                    </div>
                    <div className="flex items-center gap-0.5">
                      {isMakikoOff ? (
                        <span
                          className="inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-[2px] bg-accent/20 text-[9px] font-bold leading-none text-accent-deep"
                          title="マキコ休み"
                        >
                          マ
                        </span>
                      ) : null}
                      {isCompanyHoliday ? (
                        <span className="text-[9px] font-medium text-expense">
                          休
                        </span>
                      ) : isWeekend ? (
                        <span className="text-[9px] text-muted">休</span>
                      ) : null}
                    </div>
                  </div>
                  {showPaceBadge ? (
                    <div className="mt-1">
                      <span
                        className={`px-1 py-0.5 text-[9px] font-semibold ${
                          holidayStyleBadge
                            ? paceTone === "deficit"
                              ? "rounded-full border-2 border-[#7f1d1d] bg-[#fef2f2] text-[#7f1d1d]"
                              : paceTone === "danger"
                                ? "rounded-full border-2 border-[#9a3412] bg-[#fff7ed] text-[#9a3412]"
                                : "rounded-full border border-dashed border-[#0f766e] bg-[#ecfdf5] text-[#0f766e]"
                            : paceTone === "deficit"
                              ? "rounded bg-[#7f1d1d] text-white"
                              : paceTone === "danger"
                                ? "rounded bg-[#ea580c] text-white"
                                : "rounded border border-[#d97706] bg-[#fffbeb] text-[#b45309]"
                        }`}
                      >
                        {paceTone === "deficit"
                          ? "赤字"
                          : paceTone === "danger"
                            ? "警戒"
                            : "注意"}
                      </span>
                    </div>
                  ) : null}
                  {total > 0 ? (
                    <div className="mt-1">
                      <div className="text-[11px] font-semibold tabular-nums text-expense">
                        {total.toLocaleString()}
                      </div>
                      {count > 1 ? (
                        <div className="text-[10px] text-muted">{count}件</div>
                      ) : null}
                    </div>
                  ) : null}
                </button>
              );
            })}
          </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href={`/calendar/lunch-calc?month=${monthKey}`}
              className="rounded-md border border-line bg-white/80 px-3 py-2 text-sm text-muted hover:text-ink"
            >
              昼食計算
            </Link>
          </div>

          <ScratchpadPanel monthKey={monthKey} initialBody={scratchpadBody} />
        </div>

        <div className="grid gap-4 self-start">
          <DayPanel
            date={selectedDate}
            categories={categories}
            entries={dayEntries}
            isHoliday={selectedIsHoliday}
            isMakikoOff={selectedIsMakikoOff}
            accounts={accounts}
          />
        </div>
      </div>
      )}
    </div>
  );
}

function DayPanel({
  date,
  categories,
  entries,
  isHoliday,
  isMakikoOff,
  accounts,
}: {
  date: string;
  categories: DailySpendCategory[];
  entries: DailySpendEntry[];
  isHoliday: boolean;
  isMakikoOff: boolean;
  accounts: AssetAccount[];
}) {
  const countsInDayTotal = (e: DailySpendEntry) => {
    if (isIncomeEntry(e) || !e.category_id) return false;
    const name =
      e.daily_spend_categories?.name ??
      categories.find((c) => c.id === e.category_id)?.name ??
      "";
    return !isFixedCostCategory(name);
  };
  const daySpendEntries = entries.filter(countsInDayTotal);
  const dayTotal = daySpendEntries.reduce((s, e) => s + e.amount, 0);
  const dayIncome = entries.reduce((s, e) => {
    if (!isIncomeEntry(e)) return s;
    return s + e.amount;
  }, 0);
  const dayPoints = entries.reduce((s, e) => s + (e.points_amount ?? 0), 0);
  const [editing, setEditing] = useState<DailySpendEntry | null>(null);
  const [holidayPending, startHoliday] = useTransition();
  const [holidayError, setHolidayError] = useState<string | null>(null);
  const [makikoPending, startMakiko] = useTransition();
  const [makikoError, setMakikoError] = useState<string | null>(null);
  const dow = parseISO(date).getDay();
  const isWeekend = dow === 0 || dow === 6;

  return (
    <section className="grid gap-3 rounded-xl border border-line/80 bg-surface p-4">
      <div>
        <h2 className="text-lg font-bold">{date}</h2>
        <p className="text-sm text-muted">
          当日合計{" "}
          <span className="font-semibold tabular-nums text-expense">
            {formatYen(dayTotal)}
          </span>
          （{daySpendEntries.length}件）
          {dayIncome > 0 ? (
            <span className="ml-2 tabular-nums text-income">
              · 収入 {formatYen(dayIncome)}
            </span>
          ) : null}
          {dayPoints > 0 ? (
            <span className="ml-2 tabular-nums">
              · ポイント {formatYen(dayPoints)}
            </span>
          ) : null}
          {isHoliday ? (
            <span className="ml-2 text-expense">· 会社休日</span>
          ) : isWeekend ? (
            <span className="ml-2">· 土日</span>
          ) : (
            <span className="ml-2">· 平日</span>
          )}
          {isMakikoOff ? (
            <span className="ml-2 text-accent-deep">· マキコ休み</span>
          ) : null}
        </p>
      </div>

      <form
        className="flex flex-wrap items-center gap-2 rounded-lg border border-line/70 bg-white/70 px-3 py-2"
        action={(fd) => {
          startHoliday(async () => {
            const res = await setDailySpendHoliday(fd);
            setHolidayError(res?.error ?? null);
          });
        }}
      >
        <input type="hidden" name="date" value={date} />
        <input type="hidden" name="enabled" value={isHoliday ? "0" : "1"} />
        <p className="flex-1 text-xs text-muted">
          会社都合で平日が休みのとき「休日」にすると、昼食の一日上限の残り平日数から除外されます。
        </p>
        <button
          type="submit"
          disabled={holidayPending}
          className={`rounded-md px-3 py-1.5 text-xs ${
            isHoliday
              ? "border border-line text-muted hover:bg-white"
              : "bg-accent text-white hover:bg-accent-deep"
          } disabled:opacity-60`}
        >
          {holidayPending
            ? "更新中…"
            : isHoliday
              ? "休日を解除"
              : "この日を休日にする"}
        </button>
        {holidayError ? (
          <p className="w-full text-xs text-expense">{holidayError}</p>
        ) : null}
      </form>

      <form
        className="flex flex-wrap items-center gap-2 rounded-lg border border-line/70 bg-white/70 px-3 py-2"
        action={(fd) => {
          startMakiko(async () => {
            const res = await setDailySpendMakikoOff(fd);
            setMakikoError(res?.error ?? null);
          });
        }}
      >
        <input type="hidden" name="date" value={date} />
        <input type="hidden" name="enabled" value={isMakikoOff ? "0" : "1"} />
        <p className="flex-1 text-xs text-muted">
          マキコ休みの日に「マ」を付けます（カレンダー表示用。昼食の平日数には影響しません）。
        </p>
        <button
          type="submit"
          disabled={makikoPending}
          className={`rounded-md px-3 py-1.5 text-xs ${
            isMakikoOff
              ? "border border-line text-muted hover:bg-white"
              : "bg-accent text-white hover:bg-accent-deep"
          } disabled:opacity-60`}
        >
          {makikoPending
            ? "更新中…"
            : isMakikoOff
              ? "マキコ休みを解除"
              : "マキコ休みにする"}
        </button>
        {makikoError ? (
          <p className="w-full text-xs text-expense">{makikoError}</p>
        ) : null}
      </form>

      <EntryForm
        key={editing?.id ?? `new-${date}`}
        date={date}
        categories={categories}
        accounts={accounts}
        editing={editing}
        onCancel={() => setEditing(null)}
      />

      {entries.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-sm text-muted">
          この日の記録はまだありません。何回でも追加できます。
        </p>
      ) : (
        <ul className="divide-y divide-line/70 overflow-hidden rounded-lg border border-line/70">
          {entries.map((e) => (
            <li key={e.id} className="flex items-center gap-2 px-3 py-2.5">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{
                  backgroundColor: e.daily_spend_categories?.color ?? "#64748b",
                }}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {isIncomeEntry(e)
                    ? "収入"
                    : (e.daily_spend_categories?.name ?? "用途")}
                  {e.memo ? ` · ${e.memo}` : ""}
                  {e.scheduled_rule_id ? (
                    <span className="ml-1 text-[10px] text-muted">取引</span>
                  ) : null}
                </p>
                <p className="truncate text-[11px] text-muted">
                  {accounts.find((a) => a.id === e.asset_account_id)?.name ?? ""}
                </p>
              </div>
              <p className="shrink-0 text-right text-sm">
                <span
                  className={`tabular-nums ${
                    isIncomeEntry(e) ? "text-income" : "text-expense"
                  }`}
                >
                  {formatYen(e.amount)}
                </span>
                {(e.points_amount ?? 0) > 0 ? (
                  <span className="mt-0.5 block text-[10px] tabular-nums text-muted">
                    Pt {formatYen(e.points_amount)}
                  </span>
                ) : null}
              </p>
              <button
                type="button"
                className="text-xs text-accent"
                onClick={() => setEditing(e)}
              >
                編集
              </button>
              <form action={deleteDailySpendEntry}>
                <input type="hidden" name="id" value={e.id} />
                <button type="submit" className="text-xs text-muted hover:text-expense">
                  削除
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function EntryForm({
  date,
  categories,
  accounts,
  editing,
  onCancel,
}: {
  date: string;
  categories: DailySpendCategory[];
  accounts: AssetAccount[];
  editing: DailySpendEntry | null;
  onCancel: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [pending, startTransition] = useTransition();
  const quickCategories = categories.filter(
    (c) =>
      !isTransportCategory(c.name) &&
      !isFixedCostCategory(c.name) &&
      !isConfidentialCategory(c.name),
  );
  const transportCategory = categories.find((c) => isTransportCategory(c.name));
  const initialCategoryId =
    editing?.category_id ?? quickCategories[0]?.id ?? categories[0]?.id ?? "";
  const [categoryId, setCategoryId] = useState(initialCategoryId);
  const categoryName =
    categories.find((c) => c.id === categoryId)?.name ?? "";
  const [accountId, setAccountId] = useState(() =>
    defaultAccountId(accounts, categoryName, editing?.asset_account_id),
  );
  const isEdit = Boolean(editing);

  function pickCategory(id: string) {
    setCategoryId(id);
    const name = categories.find((c) => c.id === id)?.name ?? "";
    setAccountId(
      defaultAccountId(
        accounts,
        name,
        id === editing?.category_id ? editing?.asset_account_id : null,
      ),
    );
  }

  return (
    <form
      key={`${editing?.id ?? "new"}-${formKey}`}
      className="grid gap-2 rounded-lg border border-line/70 bg-white/70 p-3"
      action={(fd) => {
        startTransition(async () => {
          const res = isEdit
            ? await updateDailySpendEntry(fd)
            : await createDailySpendEntry(fd);
          setError(res?.error ?? null);
          if (!res?.error) {
            if (isEdit) onCancel();
            else {
              setFormKey((k) => k + 1);
              const nextId = quickCategories[0]?.id ?? "";
              setCategoryId(nextId);
              const name = categories.find((c) => c.id === nextId)?.name ?? "";
              setAccountId(defaultAccountId(accounts, name, null));
            }
          }
        });
      }}
    >
      <p className="text-sm font-medium">
        {isEdit ? "記録を編集" : "支出を追加（何回でも可）"}
      </p>
      {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
      <input type="hidden" name="date" value={editing?.date ?? date} />
      <input type="hidden" name="category_id" value={categoryId} />
      <div className="grid gap-1">
        <span className="text-sm text-muted">用途</span>
        <div className="flex flex-wrap gap-1.5">
          {quickCategories.map((c) => {
            const active = c.id === categoryId;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => pickCategory(c.id)}
                className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
                  active
                    ? "text-white"
                    : "border border-line bg-white text-muted hover:text-ink"
                }`}
                style={active ? { backgroundColor: c.color } : undefined}
              >
                {c.name}
              </button>
            );
          })}
        </div>
        {isFixedCostCategory(categoryName) ? (
          <p className="text-xs text-muted">用途: 固定費（取引から入った記録）</p>
        ) : null}
      </div>
      {transportCategory ? (
        <div className="grid gap-1">
          <span className="text-sm text-muted">交通費（支払い元は Suica が初期）</span>
          <button
            type="button"
            onClick={() => pickCategory(transportCategory.id)}
            className={`w-fit rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
              categoryId === transportCategory.id
                ? "text-white"
                : "border border-line bg-white text-muted hover:text-ink"
            }`}
            style={
              categoryId === transportCategory.id
                ? { backgroundColor: transportCategory.color }
                : undefined
            }
          >
            交通費
          </button>
        </div>
      ) : null}
      <PaymentSourceField
        accounts={accounts}
        categoryName={categoryName}
        value={accountId}
        onChange={setAccountId}
      />
      <div className="grid grid-cols-2 gap-2">
        <label className="grid min-w-0 gap-1 text-sm">
          <span className="text-muted">金額（円）</span>
          <input
            name="amount"
            type="number"
            min={0}
            defaultValue={editing?.amount ?? ""}
            className="w-full min-w-0 rounded-md border border-line bg-white px-3 py-2"
            placeholder="1200"
          />
        </label>
        <label className="grid min-w-0 gap-1 text-sm">
          <span className="text-muted">ポイント決済（円相当）</span>
          <input
            name="points_amount"
            type="number"
            min={0}
            defaultValue={editing?.points_amount ?? ""}
            className="w-full min-w-0 rounded-md border border-line bg-white px-3 py-2"
            placeholder="0"
          />
        </label>
      </div>
      <p className="text-[11px] text-muted">
        ポイントは月合計の参考表示のみ。小遣い予算・グラフ・注意アラートには含めません。
      </p>
      <label className="grid gap-1 text-sm">
        <span className="text-muted">メモ（任意）</span>
        <input
          name="memo"
          defaultValue={editing?.memo ?? ""}
          className="rounded-md border border-line bg-white px-3 py-2"
          placeholder="任意"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending || !categoryId}
          className="rounded-md bg-accent px-4 py-2 text-sm text-white hover:bg-accent-deep disabled:opacity-60"
        >
          {pending ? "保存中…" : isEdit ? "更新" : "追加"}
        </button>
        {isEdit ? (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-line px-3 py-2 text-sm text-muted"
          >
            キャンセル
          </button>
        ) : null}
      </div>
      {error ? <p className="text-sm text-expense">{error}</p> : null}
    </form>
  );
}

function BudgetPopup({
  category,
  monthKey,
}: {
  category: DailySpendCategory & { monthly_budget: number };
  monthKey: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, startTransition] = useTransition();
  const legacy =
    isLegacyPocketMonth(monthKey) && isPocketBudgetCategory(category.name);
  const shown = resolveCategoryBudget(
    category.name,
    monthKey,
    category.monthly_budget,
  );

  return (
    <form
      className="grid gap-2"
      action={(fd) => {
        startTransition(async () => {
          const res = await updateDailySpendCategory(fd);
          setError(res?.error ?? null);
          setOk(!res?.error);
        });
      }}
    >
      <input type="hidden" name="id" value={category.id} />
      <input type="hidden" name="name" value={category.name} />
      <input type="hidden" name="color" value={category.color} />
      <label className="grid gap-1 text-sm">
        <span className="text-muted">月予算（円）</span>
        <input
          name="monthly_budget"
          type="number"
          min={0}
          required
          defaultValue={category.monthly_budget}
          className="rounded-md border border-line bg-white px-3 py-2"
        />
      </label>
      {legacy ? (
        <p className="text-xs text-muted">
          2026年7月の表示は固定の {shown.toLocaleString()} 円のままです。ここは8月以降の予算です。
        </p>
      ) : (
        <p className="text-xs text-muted">この用途の月予算を更新します。</p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-accent px-3 py-2 text-sm text-white disabled:opacity-60"
      >
        {pending ? "保存中…" : "保存"}
      </button>
      {ok && !error ? <p className="text-sm text-income">保存しました</p> : null}
      {error ? <p className="text-sm text-expense">{error}</p> : null}
    </form>
  );
}
