import { format } from "date-fns";
import { CalendarClient } from "@/components/calendar-client";
import {
  ensureDailySpendCategories,
  fetchDailyScratchpad,
  fetchDailySpendEntriesInRange,
  fetchDailySpendHolidaysInRange,
  fetchDailySpendMakikoOffsInRange,
  fetchSuicaDisplayBalance,
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
  const today = new Date();
  const monthKey = params.month ?? format(today, "yyyy-MM");
  const selectedDate =
    params.date ??
    (params.month ? `${monthKey}-01` : format(today, "yyyy-MM-dd"));
  const view = params.view === "list" ? "list" : "calendar";
  const compareMonth =
    params.compare && /^\d{4}-\d{2}$/.test(params.compare) && params.compare >= "2026-08"
      ? params.compare
      : "";

  const start = `${monthKey}-01`;
  const [y, m] = monthKey.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const end = `${monthKey}-${String(lastDay).padStart(2, "0")}`;

  const [categories, entries, holidays, makikoOffs, scratchpad, suica] =
    await Promise.all([
      ensureDailySpendCategories(),
      fetchDailySpendEntriesInRange(start, end),
      fetchDailySpendHolidaysInRange(start, end),
      fetchDailySpendMakikoOffsInRange(start, end),
      fetchDailyScratchpad(monthKey),
      fetchSuicaDisplayBalance(),
    ]);

  let compareEntries = entries;
  if (compareMonth && compareMonth !== monthKey) {
    const compareStart = `${compareMonth}-01`;
    const [cy, cm] = compareMonth.split("-").map(Number);
    const compareLastDay = new Date(cy, cm, 0).getDate();
    const compareEnd = `${compareMonth}-${String(compareLastDay).padStart(2, "0")}`;
    compareEntries = await fetchDailySpendEntriesInRange(compareStart, compareEnd);
  }

  const listCategoryId =
    params.category && categories.some((c) => c.id === params.category)
      ? params.category
      : (categories[0]?.id ?? "");

  return (
    <div className="grid gap-4">
      <p className="rounded-xl border border-line/80 bg-white/60 px-4 py-3 text-sm text-muted">
        用途（家族・昼食・雑費・酒・お菓子・その他・交通費）ごとに記録します。「用途別一覧」でカテゴリごとにまとめて確認・編集できます。雑費予算は雑費＋酒＋お菓子の合計で消化します。「その他」は家族＋昼食＋雑費の合計枠（小遣い残り）から減ります。
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
        suica={suica}
      />
    </div>
  );
}
