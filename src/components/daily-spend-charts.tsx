"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type XAxisTickContentProps,
} from "recharts";
import { formatYen } from "@/lib/money";
import type { DailySpendCategory, DailySpendEntry } from "@/lib/types";
import {
  isMiscGroupCategory,
  isMiscGroupChild,
  isPocketBudgetCategory,
  isSharedPoolCategory,
  isConfidentialCategory,
  isExcludedFromMonthTotalCategory,
  isTransportCategory,
  MISC_BUDGET_NAME,
  resolveCategoryBudget,
} from "@/lib/types";
import {
  buildMonthPaceWeights,
  expectedRemainingByWeight,
  paceToneFromGap,
} from "@/lib/daily-spend-pace";

type Props = {
  monthKey: string;
  categories: DailySpendCategory[];
  entries: DailySpendEntry[];
  holidayDates: string[];
  makikoOffDates?: string[];
  compareMonth: string;
  compareEntries: DailySpendEntry[];
};

function yenTick(n: number): string {
  if (Math.abs(n) >= 10000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

const DAILY_STACK_ORDER = [
  "家族",
  "昼食",
  "雑費",
  "酒",
  "お菓子",
  "その他",
] as const;

export function DailySpendCharts({
  monthKey,
  categories,
  entries,
  holidayDates,
  makikoOffDates = [],
  compareMonth,
  compareEntries,
}: Props) {
  const holidaySet = useMemo(() => new Set(holidayDates), [holidayDates]);
  const makikoSet = useMemo(() => new Set(makikoOffDates), [makikoOffDates]);

  const categoryBars = useMemo(() => {
    const miscSpent = entries
      .filter((e) => {
        const cat = categories.find((c) => c.id === e.category_id);
        return cat ? isMiscGroupCategory(cat.name) : false;
      })
      .reduce((s, e) => s + e.amount, 0);

    return categories.map((c) => {
      const spentAlone = entries
        .filter((e) => e.category_id === c.id)
        .reduce((s, e) => s + e.amount, 0);
      const spentVsBudget =
        c.name === MISC_BUDGET_NAME ? miscSpent : spentAlone;
      const budget =
        isMiscGroupChild(c.name) || isSharedPoolCategory(c.name)
          ? 0
          : resolveCategoryBudget(c.name, monthKey, c.monthly_budget);
      return {
        name: c.name,
        /** 円グラフ用（用途ごとの実額。二重計上しない） */
        spent: spentAlone,
        /** 棒グラフの予算対比用（雑費は酒・お菓子込み） */
        spentVsBudget,
        budget,
        color: c.color,
        transport: isTransportCategory(c.name),
        confidential: isConfidentialCategory(c.name),
        miscChild: isMiscGroupChild(c.name),
      };
    });
  }, [categories, entries, monthKey]);

  const pieData = useMemo(
    () =>
      categoryBars.filter(
        (c) => c.spent > 0 && !c.transport && !c.confidential,
      ),
    [categoryBars],
  );

  /** 用途別棒グラフ: 酒・お菓子は雑費列にスタック（日次グラフと同じ） */
  const budgetChart = useMemo(() => {
    const byName = new Map(categoryBars.map((c) => [c.name, c]));
    const miscParent = byName.get(MISC_BUDGET_NAME);
    const sake = byName.get("酒");
    const candy = byName.get("お菓子");

    const rows: Array<Record<string, string | number>> = [];
    for (const c of categoryBars) {
      if (c.transport || c.confidential || c.miscChild) continue;
      if (c.budget <= 0 && c.spentVsBudget <= 0 && c.spent <= 0) continue;

      if (c.name === MISC_BUDGET_NAME) {
        const miscAlone = miscParent?.spent ?? 0;
        const sakeSpent = sake?.spent ?? 0;
        const candySpent = candy?.spent ?? 0;
        if (c.budget <= 0 && miscAlone + sakeSpent + candySpent <= 0) continue;
        rows.push({
          name: "雑費",
          budget: c.budget,
          雑費: miscAlone,
          酒: sakeSpent,
          お菓子: candySpent,
        });
        continue;
      }

      rows.push({
        name: c.name,
        budget: c.budget,
        雑費: 0,
        酒: 0,
        お菓子: 0,
        [c.name]: c.spent,
      });
    }

    const stackKeys = [
      { key: "家族", color: byName.get("家族")?.color ?? "#be185d" },
      { key: "昼食", color: byName.get("昼食")?.color ?? "#c2410c" },
      { key: "雑費", color: byName.get("雑費")?.color ?? "#0369a1" },
      { key: "酒", color: byName.get("酒")?.color ?? "#7c2d12" },
      { key: "お菓子", color: byName.get("お菓子")?.color ?? "#a16207" },
      { key: "その他", color: byName.get("その他")?.color ?? "#7c3aed" },
    ].filter((s) => rows.some((r) => Number(r[s.key] ?? 0) > 0));

    return { rows, stackKeys };
  }, [categoryBars]);

  const pocketBudgetTotal = useMemo(
    () =>
      categories
        .filter((c) => isPocketBudgetCategory(c.name))
        .reduce(
          (s, c) =>
            s + resolveCategoryBudget(c.name, monthKey, c.monthly_budget),
          0,
        ),
    [categories, monthKey],
  );

  const dailyBalance = useMemo(() => {
    const [y, m] = monthKey.split("-").map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const byDateTotal = new Map<string, number>();
    const excludedIds = new Set(
      categories
        .filter((c) => isExcludedFromMonthTotalCategory(c.name))
        .map((c) => c.id),
    );
    const chartCategories = categories.filter((c) => !excludedIds.has(c.id));
    const spentByCategory = new Map<string, number>();
    for (const e of entries) {
      if (excludedIds.has(e.category_id)) continue;
      spentByCategory.set(
        e.category_id,
        (spentByCategory.get(e.category_id) ?? 0) + e.amount,
      );
    }
    const chartCategoriesWithSpend = chartCategories
      .filter((c) => (spentByCategory.get(c.id) ?? 0) > 0)
      .sort((a, b) => {
        const ai = DAILY_STACK_ORDER.indexOf(
          a.name as (typeof DAILY_STACK_ORDER)[number],
        );
        const bi = DAILY_STACK_ORDER.indexOf(
          b.name as (typeof DAILY_STACK_ORDER)[number],
        );
        if (ai >= 0 && bi >= 0) return ai - bi;
        if (ai >= 0) return -1;
        if (bi >= 0) return 1;
        return a.name.localeCompare(b.name, "ja");
      });
    const categoryById = new Map(categories.map((c) => [c.id, c]));

    for (const e of entries) {
      if (excludedIds.has(e.category_id)) continue;
      byDateTotal.set(e.date, (byDateTotal.get(e.date) ?? 0) + e.amount);
    }

    const paceWeights = buildMonthPaceWeights(monthKey, holidaySet, makikoSet);
    let cumulative = 0;
    const rows: Array<Record<string, number | string>> = [];
    for (let d = 1; d <= lastDay; d++) {
      const key = `${monthKey}-${String(d).padStart(2, "0")}`;
      const row: Record<string, number | string> = {
        day: String(d),
        remaining: pocketBudgetTotal,
      };
      for (const c of chartCategoriesWithSpend) {
        row[c.id] = 0;
      }
      for (const e of entries) {
        if (e.date !== key || excludedIds.has(e.category_id)) continue;
        row[e.category_id] = Number(row[e.category_id] ?? 0) + e.amount;
      }

      const daily = byDateTotal.get(key) ?? 0;
      cumulative += daily;
      row.remaining = pocketBudgetTotal - cumulative;
      row.expectedRemaining = expectedRemainingByWeight(
        pocketBudgetTotal,
        paceWeights.cumulativeThrough[d - 1] ?? 0,
        paceWeights.totalWeight,
      );
      row.paceGap = Number(row.remaining) - Number(row.expectedRemaining);
      rows.push(row);
    }

    let latestDay = 1;
    for (const e of entries) {
      const day = Number(e.date.slice(-2));
      if (!Number.isNaN(day)) latestDay = Math.max(latestDay, day);
    }
    const latestRow = rows[latestDay - 1];
    const latestRemaining = Number(latestRow?.remaining ?? pocketBudgetTotal);
    const latestExpected = Number(latestRow?.expectedRemaining ?? pocketBudgetTotal);
    const latestGap = latestRemaining - latestExpected;
    // 月末見込み: 経過ウェイト分のペースを残りウェイトへ延長（暦日均等ではない）
    const weightSoFar = paceWeights.cumulativeThrough[latestDay - 1] ?? 0;
    const projectedSpend =
      weightSoFar > 0
        ? Math.round(
            ((Number(pocketBudgetTotal) - latestRemaining) /
              weightSoFar) *
              paceWeights.totalWeight,
          )
        : 0;
    const projectedOver = projectedSpend - pocketBudgetTotal;
    const tone = paceToneFromGap(latestGap, pocketBudgetTotal, latestRemaining);

    return {
      rows,
      chartCategories: chartCategoriesWithSpend,
      categoryById,
      alert: {
        latestDay,
        latestRemaining,
        latestExpected,
        latestGap,
        projectedSpend,
        projectedOver,
        tone,
      },
    };
  }, [
    monthKey,
    entries,
    categories,
    pocketBudgetTotal,
    holidaySet,
    makikoSet,
  ]);

  const hasAny = entries.length > 0;
  const hasCompare = Boolean(compareMonth && compareMonth !== monthKey);

  const compareCategoryBars = useMemo(() => {
    if (!hasCompare) return [];
    return categories.map((c) => {
      const current = entries
        .filter((e) => e.category_id === c.id)
        .reduce((s, e) => s + e.amount, 0);
      const previous = compareEntries
        .filter((e) => e.category_id === c.id)
        .reduce((s, e) => s + e.amount, 0);
      return {
        name: c.name,
        current,
        previous,
        color: c.color,
      };
    });
  }, [categories, compareEntries, entries, hasCompare]);

  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-xl border border-line/80 bg-surface p-4">
        <h2 className="text-sm font-bold">用途別の支出</h2>
        <p className="mt-0.5 text-xs text-muted">
          棒は使用額（雑費は酒・お菓子を重ねて表示）。薄い帯は月予算（その他は予算なし）
        </p>
        {hasAny && budgetChart.rows.length > 0 ? (
          <div className="mt-3 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={budgetChart.rows}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#c9d9d4" />
                <XAxis
                  dataKey="name"
                  tick={{ fill: "#5b6f69", fontSize: 11 }}
                  axisLine={{ stroke: "#c9d9d4" }}
                />
                <YAxis
                  tickFormatter={yenTick}
                  tick={{ fill: "#5b6f69", fontSize: 11 }}
                  axisLine={{ stroke: "#c9d9d4" }}
                  width={40}
                />
                <Tooltip
                  formatter={(value, name) => [
                    formatYen(Number(value ?? 0)),
                    name === "budget" ? "予算" : String(name),
                  ]}
                  contentStyle={{
                    borderRadius: 8,
                    borderColor: "#c9d9d4",
                    fontSize: 12,
                  }}
                />
                <Legend
                  verticalAlign="bottom"
                  height={28}
                  formatter={(value) => (
                    <span style={{ color: "#5b6f69", fontSize: 11 }}>
                      {value === "budget" ? "予算" : value}
                    </span>
                  )}
                />
                <Bar
                  dataKey="budget"
                  name="budget"
                  fill="#c9d9d4"
                  radius={[4, 4, 0, 0]}
                />
                {budgetChart.stackKeys.map((s) => (
                  <Bar
                    key={s.key}
                    dataKey={s.key}
                    name={s.key}
                    stackId="spent"
                    fill={s.color}
                    maxBarSize={36}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyChart />
        )}
      </div>

      <div className="rounded-xl border border-line/80 bg-surface p-4">
        <h2 className="text-sm font-bold">用途の割合</h2>
        <p className="mt-0.5 text-xs text-muted">
          当月の使用額の内訳（用途ごと。ポイント決済は含まない）
        </p>
        {pieData.length > 0 ? (
          <div className="mt-3 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="spent"
                  nameKey="name"
                  cx="50%"
                  cy="45%"
                  innerRadius={48}
                  outerRadius={78}
                  paddingAngle={2}
                >
                  {pieData.map((c) => (
                    <Cell key={c.name} fill={c.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => formatYen(Number(value ?? 0))}
                  contentStyle={{
                    borderRadius: 8,
                    borderColor: "#c9d9d4",
                    fontSize: 12,
                  }}
                />
                <Legend
                  verticalAlign="bottom"
                  height={36}
                  formatter={(value) => (
                    <span style={{ color: "#5b6f69", fontSize: 11 }}>{value}</span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyChart />
        )}
      </div>

      <div className="rounded-xl border border-line/80 bg-surface p-4 lg:col-span-2">
        <h2 className="text-sm font-bold">日ごとの支出と予算残高</h2>
        <p className="mt-0.5 text-xs text-muted">
          棒 = カテゴリ別の日別支出（交通費除く・色分け）/ 線 = 小遣い予算残高（家族・昼食・雑費の合計枠 − 累計使用）
          {" · "}
          横軸:{" "}
          <span className="font-semibold text-[#2563eb]">土</span>
          {" / "}
          <span className="font-semibold text-[#dc2626]">日</span>
          {" / "}
          <span className="font-semibold text-[#b45309]">休</span>
          （会社休日）
        </p>
        {hasAny ? (
          <>
          <div className="mt-3 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={dailyBalance.rows}
                margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#c9d9d4" />
                <XAxis
                  dataKey="day"
                  tick={(props: XAxisTickContentProps) => {
                    const x = Number(props.x) || 0;
                    const y = Number(props.y) || 0;
                    const day = String(props.payload?.value ?? "");
                    const dateKey = `${monthKey}-${day.padStart(2, "0")}`;
                    const isHoliday = holidaySet.has(dateKey);
                    const [yy, mm] = monthKey.split("-").map(Number);
                    const dow = new Date(yy, mm - 1, Number(day) || 1).getDay();
                    const isSunday = dow === 0;
                    const isSaturday = dow === 6;
                    const mark = isHoliday
                      ? "休"
                      : isSunday
                        ? "日"
                        : isSaturday
                          ? "土"
                          : "";
                    const fill = isHoliday
                      ? "#b45309"
                      : isSunday
                        ? "#dc2626"
                        : isSaturday
                          ? "#2563eb"
                          : "#5b6f69";
                    const fontWeight = mark ? 700 : 400;
                    return (
                      <g transform={`translate(${x},${y})`}>
                        <text
                          x={0}
                          y={0}
                          dy={16}
                          textAnchor="middle"
                          fill={fill}
                          fontSize={10}
                          fontWeight={fontWeight}
                        >
                          {day}
                          {mark}
                        </text>
                      </g>
                    );
                  }}
                  axisLine={{ stroke: "#c9d9d4" }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  yAxisId="left"
                  tickFormatter={yenTick}
                  tick={{ fill: "#5b6f69", fontSize: 11 }}
                  axisLine={{ stroke: "#c9d9d4" }}
                  width={44}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tickFormatter={yenTick}
                  tick={{ fill: "#5b6f69", fontSize: 11 }}
                  axisLine={{ stroke: "#c9d9d4" }}
                  width={44}
                />
                <Tooltip
                  labelFormatter={(day) => `${monthKey}-${String(day).padStart(2, "0")}`}
                  formatter={(value, name) => [
                    formatYen(Number(value ?? 0)),
                    name === "remaining"
                      ? "予算残高"
                      : name === "expectedRemaining"
                        ? "目安残高"
                        : name === "paceGap"
                          ? "ペース差"
                          : String(name),
                  ]}
                  itemSorter={(item) =>
                    item.dataKey === "remaining" ? 9999 : -Number(item.value ?? 0)
                  }
                  contentStyle={{
                    borderRadius: 8,
                    borderColor: "#c9d9d4",
                    fontSize: 12,
                  }}
                />
                <Legend
                  verticalAlign="top"
                  height={28}
                  formatter={(value) => {
                    if (value === "remaining") return "予算残高";
                    if (value === "expectedRemaining") return "目安残高";
                    return dailyBalance.categoryById.get(String(value))?.name ?? String(value);
                  }}
                />
                {dailyBalance.chartCategories.map((c) => (
                  <Bar
                    key={c.id}
                    yAxisId="left"
                    dataKey={c.id}
                    name={c.name}
                    stackId="dailySpend"
                    fill={c.color}
                    maxBarSize={28}
                  />
                ))}
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="remaining"
                  name="remaining"
                  stroke="#b45309"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="expectedRemaining"
                  name="expectedRemaining"
                  stroke="#475569"
                  strokeDasharray="5 5"
                  strokeWidth={1.5}
                  dot={false}
                  activeDot={{ r: 3 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div
            className={`mt-2 rounded-md px-2.5 py-2 text-xs ${
              dailyBalance.alert.tone === "deficit"
                ? "bg-[#7f1d1d]/15 text-[#7f1d1d]"
                : dailyBalance.alert.tone === "danger"
                  ? "bg-expense/10 text-expense"
                  : dailyBalance.alert.tone === "warn"
                    ? "bg-[#f59e0b]/10 text-[#b45309]"
                    : "bg-income/10 text-income"
            }`}
          >
            {dailyBalance.alert.tone === "deficit"
              ? "赤字: 小遣い予算を超過しています。"
              : dailyBalance.alert.tone === "danger"
                ? "警戒: 消化ペースが目安より速いです。"
                : dailyBalance.alert.tone === "warn"
                  ? "注意: やや使い過ぎペースです。"
                  : "順調: 目安ペース内です。"}
            {" "}
            {dailyBalance.alert.latestDay}日時点で残高 {formatYen(dailyBalance.alert.latestRemaining)}
            （目安 {formatYen(dailyBalance.alert.latestExpected)} / 差{" "}
            {dailyBalance.alert.latestGap > 0 ? "+" : ""}
            {formatYen(dailyBalance.alert.latestGap)}）。
            {" "}
            このペースだと月末見込み支出は {formatYen(dailyBalance.alert.projectedSpend)}
            {dailyBalance.alert.projectedOver > 0
              ? `（予算超過見込み +${formatYen(dailyBalance.alert.projectedOver)}）`
              : `（予算内見込み ${formatYen(Math.abs(dailyBalance.alert.projectedOver))} 余り）`}
            です。
          </div>
          <p className="mt-1 text-[11px] text-muted">
            横軸で「休」と表示された日は、会社休日として設定した日です。
          </p>
          </>
        ) : (
          <EmptyChart />
        )}
      </div>

      {hasCompare ? (
        <div className="rounded-xl border border-line/80 bg-surface p-4 lg:col-span-2">
          <h2 className="text-sm font-bold">用途別の月比較</h2>
          <p className="mt-0.5 text-xs text-muted">
            {monthKey}（濃色）と {compareMonth}（薄色）の使用額比較
          </p>
          <div className="mt-3 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={compareCategoryBars}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#c9d9d4" />
                <XAxis
                  dataKey="name"
                  tick={{ fill: "#5b6f69", fontSize: 11 }}
                  axisLine={{ stroke: "#c9d9d4" }}
                />
                <YAxis
                  tickFormatter={yenTick}
                  tick={{ fill: "#5b6f69", fontSize: 11 }}
                  axisLine={{ stroke: "#c9d9d4" }}
                  width={44}
                />
                <Tooltip
                  formatter={(value, name) => [
                    formatYen(Number(value ?? 0)),
                    name === "current" ? monthKey : compareMonth,
                  ]}
                  contentStyle={{
                    borderRadius: 8,
                    borderColor: "#c9d9d4",
                    fontSize: 12,
                  }}
                />
                <Legend
                  formatter={(value) => (value === "current" ? monthKey : compareMonth)}
                />
                <Bar dataKey="previous" name="previous" fill="#9ca3af" radius={[4, 4, 0, 0]} />
                <Bar dataKey="current" name="current" radius={[4, 4, 0, 0]}>
                  {compareCategoryBars.map((c) => (
                    <Cell key={c.name} fill={c.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function EmptyChart() {
  return (
    <p className="mt-6 rounded-lg border border-dashed border-line px-4 py-10 text-center text-sm text-muted">
      この月の記録がまだないのでグラフは空です
    </p>
  );
}
