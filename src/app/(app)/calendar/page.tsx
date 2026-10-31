import { CalendarClient } from "@/components/calendar-client";
import { buildAccountBalanceViews } from "@/lib/account-display";
import { payPeriodContaining } from "@/lib/pay-period";
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
  const scheduleError = await prepareDailySpendSchedules(categories, accounts);

  const snapshots = await fetchAccountBalanceSnapshots();
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
  const payPeriod = payPeriodContaining(today);

  const [entries, holidays, makikoOffs, scratchpad, rules, movements, payPeriodEntries] =
    await Promise.all([
      fetchDailySpendEntriesInRange(start, end),
      fetchDailySpendHolidaysInRange(start, end),
      fetchDailySpendMakikoOffsInRange(start, end),
      fetchDailyScratchpad(monthKey),
      fetchScheduledRules(),
      earliest
        ? fetchBalanceMovementsSince(earliest, today)
        : Promise.resolve([]),
      fetchDailySpendEntriesInRange(payPeriod.start, payPeriod.end),
    ]);

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
      <p className="rounded-xl border border-line/80 bg-white/60 px-4 py-3 text-sm text-muted">
        毎日の支出が家計の本体です。銀行と電子マネーの残高、この月の総収入・総支出、用途別の小遣いをここで見ます。交通費は支払い元を Suica か PayPay から選びます。それ以外の支出の初期は R-PAY です。毎月の引き落としは下の「取引」に登録すると、該当日へ自動で入ります。
      </p>
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
        payPeriod={payPeriod}
        payPeriodEntries={payPeriodEntries}
      />
    </div>
  );
}
