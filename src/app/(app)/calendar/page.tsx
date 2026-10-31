import { CalendarClient } from "@/components/calendar-client";
import { buildAccountBalanceViews } from "@/lib/account-display";
import {
  defaultSelectedDateForMonth,
  monthKeyInTimeZone,
  todayKeyInTimeZone,
} from "@/lib/dates";
import {
  ensureDailySpendCategories,
  fetchAccountBalanceSnapshots,
  fetchAssetAccounts,
  fetchBalanceMovementsSince,
  fetchDailyScratchpad,
  fetchDailySpendEntriesInRange,
  fetchLunchMenuItems,
  fetchDailySpendHolidaysInRange,
  fetchDailySpendMakikoOffsInRange,
  fetchScheduledRules,
  prepareDailySpendSchedules,
} from "@/lib/data";

type Props = {
  searchParams: Promise<{
    month?: string;
    date?: string;
    view?: string;
    category?: string;
    compare?: string;
  }>;
};

export default async function CalendarPage({ searchParams }: Props) {
  const params = await searchParams;
  const currentMonth = monthKeyInTimeZone();
  const monthKey =
    params.month && /^\d{4}-\d{2}$/.test(params.month) ? params.month : currentMonth;
  const selectedDate =
    params.date ?? defaultSelectedDateForMonth(monthKey);
  const view = params.view === "list" ? "list" : "calendar";
  const compareMonth =
    params.compare && /^\d{4}-\d{2}$/.test(params.compare) && params.compare >= "2026-08"
      ? params.compare
      : "";

  const start = `${monthKey}-01`;
  const [y, m] = monthKey.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const end = `${monthKey}-${String(lastDay).padStart(2, "0")}`;

  const [categories, accounts] = await Promise.all([
    ensureDailySpendCategories(),
    fetchAssetAccounts(),
  ]);
  const [scheduleError, snapshots] = await Promise.all([
    prepareDailySpendSchedules(categories, accounts),
    fetchAccountBalanceSnapshots(),
  ]);
  const today = todayKeyInTimeZone();
  const asOfDates = accounts
    .map((account) => {
      const dated = snapshots
        .filter(
          (snap) =>
            snap.asset_account_id === account.id && snap.as_of_date <= today,
        )
        .map((snap) => snap.as_of_date);
      return dated.sort().at(-1) ?? null;
    })
    .filter((date): date is string => Boolean(date));
  const earliest = asOfDates.sort()[0];
  const todayMonth = today.slice(0, 7);
  const [ty, tm] = todayMonth.split("-").map(Number);
  const todayMonthEnd = `${todayMonth}-${String(new Date(Date.UTC(ty, tm, 0)).getUTCDate()).padStart(2, "0")}`;
  const remainderLabel = `${ty}年${tm}月1日〜${tm}月${Number(todayMonthEnd.slice(8))}日`;

  const [entries, holidays, makikoOffs, scratchpad, rules, movements, todayMonthEntries, lunchMenuItems] =
    await Promise.all([
      fetchDailySpendEntriesInRange(start, end),
      fetchDailySpendHolidaysInRange(start, end),
      fetchDailySpendMakikoOffsInRange(start, end),
      fetchDailyScratchpad(monthKey),
      fetchScheduledRules(),
      earliest
        ? fetchBalanceMovementsSince(earliest, today)
        : Promise.resolve([]),
      monthKey === todayMonth
        ? Promise.resolve(null)
        : fetchDailySpendEntriesInRange(`${todayMonth}-01`, todayMonthEnd),
      fetchLunchMenuItems(),
    ]);
  const remainderEntries = todayMonthEntries ?? entries;

  let compareEntries = entries;
  if (compareMonth && compareMonth !== monthKey) {
    const compareStart = `${compareMonth}-01`;
    const [cy, cm] = compareMonth.split("-").map(Number);
    const compareLastDay = new Date(cy, cm, 0).getDate();
    const compareEnd = `${compareMonth}-${String(compareLastDay).padStart(2, "0")}`;
    compareEntries = await fetchDailySpendEntriesInRange(compareStart, compareEnd);
  }

  const balances = buildAccountBalanceViews(
    accounts,
    snapshots,
    movements,
    today,
  );

  const listCategoryId =
    params.category && categories.some((c) => c.id === params.category)
      ? params.category
      : (categories[0]?.id ?? "");

  return (
    <div className="grid gap-4">
      <CalendarClient
        monthKey={monthKey}
        categories={categories}
        entries={entries}
        compareMonth={compareMonth}
        compareEntries={compareEntries}
        holidays={holidays}
        makikoOffs={makikoOffs}
        selectedDate={selectedDate}
        view={view}
        listCategoryId={listCategoryId}
        scratchpadBody={scratchpad?.body ?? ""}
        accounts={accounts}
        balances={balances}
        rules={rules}
        scheduleError={scheduleError}
        remainderEntries={remainderEntries}
        remainderLabel={remainderLabel}
        lunchMenuItems={lunchMenuItems}
      />
    </div>
  );
}
