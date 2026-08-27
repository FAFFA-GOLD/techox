"use client";

import { eachDayOfInterval, format, parseISO } from "date-fns";
import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatYen } from "@/lib/money";
import type { LedgerItem } from "@/lib/money";
import type { PeriodRange } from "@/lib/types";

type Props = {
  period: PeriodRange;
  ledger: LedgerItem[];
};

function yenTick(n: number): string {
  if (Math.abs(n) >= 10000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

function periodTone(opts: {
  projectedNet: number;
  savingsTarget: number;
  gap: number;
  expenseBudgetTarget: number;
}): "ok" | "warn" | "danger" {
  if (opts.projectedNet < 0) return "danger";
  if (opts.gap < -Math.max(5000, opts.expenseBudgetTarget * 0.08)) return "danger";
  if (opts.projectedNet < opts.savingsTarget || opts.gap < 0) return "warn";
  return "ok";
}

const DEFAULT_PERIOD_SAVINGS_TARGET = 14000;

export function PeriodCharts({ period, ledger }: Props) {
  const incomeTotal = useMemo(
    () =>
      ledger
        .filter((i) => i.kind === "income")
        .reduce((s, i) => s + i.amount, 0),
    [ledger],
  );
  const savingsTarget = DEFAULT_PERIOD_SAVINGS_TARGET;
  const expenseBudgetTarget = Math.max(0, incomeTotal - savingsTarget);

  const expenseByType = useMemo(() => {
    const normal = ledger
      .filter((i) => i.kind === "expense" && i.source !== "card" && i.source !== "loan")
      .reduce((s, i) => s + i.amount, 0);
    const card = ledger
      .filter((i) => i.kind === "expense" && i.source === "card")
      .reduce((s, i) => s + i.amount, 0);
    const loan = ledger
      .filter((i) => i.kind === "expense" && i.source === "loan")
      .reduce((s, i) => s + i.amount, 0);
    const income = ledger
      .filter((i) => i.kind === "income")
      .reduce((s, i) => s + i.amount, 0);
    return [
      { name: "収入", amount: income, color: "#0f766e" },
      { name: "通常支出", amount: normal, color: "#b45309" },
      { name: "カード", amount: card, color: "#0369a1" },
      { name: "ローン", amount: loan, color: "#9a3412" },
    ];
  }, [ledger]);

  const dailyRows = useMemo(() => {
    const intervalDays = eachDayOfInterval({
      start: parseISO(period.start),
      end: parseISO(period.end),
    });
    const byDate = new Map<string, { net: number; income: number; expense: number }>();
    for (const item of ledger) {
      const cur = byDate.get(item.date) ?? { net: 0, income: 0, expense: 0 };
      if (item.kind === "income") {
        cur.income += item.amount;
        cur.net += item.amount;
      } else {
        cur.expense += item.amount;
        cur.net -= item.amount;
      }
      byDate.set(item.date, cur);
    }

    let running = 0;
    let cumulativeIncome = 0;
    let cumulativeExpense = 0;
    return intervalDays.map((d, idx) => {
      const key = format(d, "yyyy-MM-dd");
      const cur = byDate.get(key) ?? { net: 0, income: 0, expense: 0 };
      running += cur.net;
      cumulativeIncome += cur.income;
      cumulativeExpense += cur.expense;
      const progress = intervalDays.length > 0 ? (idx + 1) / intervalDays.length : 1;
      const expectedExpense = Math.round(expenseBudgetTarget * progress);
      return {
        day: format(d, "M/d"),
        net: cur.net,
        running,
        guardRunning: cumulativeIncome - expectedExpense,
        cumulativeExpense,
      };
    });
  }, [ledger, period.end, period.start, expenseBudgetTarget]);

  const periodAlert = useMemo(() => {
    const totalDays = dailyRows.length;
    const latestActiveIndex = Math.max(
      0,
      dailyRows.reduce((acc, row, idx) => (row.net !== 0 ? idx : acc), -1),
    );
    const latest = dailyRows[latestActiveIndex] ?? {
      running: 0,
      guardRunning: 0,
      cumulativeExpense: 0,
    };
    const latestDay = latestActiveIndex + 1;
    const projectedExpense =
      latestDay > 0
        ? Math.round((Number(latest.cumulativeExpense) / latestDay) * totalDays)
        : 0;
    const projectedNet = incomeTotal - projectedExpense;
    const gap = Number(latest.running) - Number(latest.guardRunning);
    const tone = periodTone({
      projectedNet,
      savingsTarget,
      gap,
      expenseBudgetTarget,
    });
    return {
      latestDay,
      projectedExpense,
      projectedNet,
      gap,
      tone,
    };
  }, [dailyRows, incomeTotal, savingsTarget, expenseBudgetTarget]);

  const firstDaySummary = useMemo(() => {
    const firstDayItems = ledger.filter((i) => i.date === period.start);
    const income = firstDayItems
      .filter((i) => i.kind === "income")
      .reduce((s, i) => s + i.amount, 0);
    const expense = firstDayItems
      .filter((i) => i.kind === "expense")
      .reduce((s, i) => s + i.amount, 0);
    const net = income - expense;
    return {
      date: period.start,
      count: firstDayItems.length,
      income,
      expense,
      net,
    };
  }, [ledger, period.start]);

  const hasData = ledger.length > 0;

  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-xl border border-line/80 bg-surface p-4">
        <h2 className="text-sm font-bold">収入・支出の構成</h2>
        <p className="mt-0.5 text-xs text-muted">
          この期間の合計。通常支出・カード・ローンを分けて表示
        </p>
        {hasData ? (
          <div className="mt-3 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={expenseByType} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
                  formatter={(value) => formatYen(Number(value ?? 0))}
                  contentStyle={{
                    borderRadius: 8,
                    borderColor: "#c9d9d4",
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                  {expenseByType.map((x) => (
                    <Cell key={x.name} fill={x.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyChart />
        )}
      </div>

      <div className="rounded-xl border border-line/80 bg-surface p-4">
        <h2 className="text-sm font-bold">日別収支と累積</h2>
        <p className="mt-0.5 text-xs text-muted">
          棒 = その日の収支 / 線 = 期間開始からの累積収支
        </p>
        {hasData ? (
          <>
            <div className="mt-3 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={dailyRows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#c9d9d4" />
                <XAxis
                  dataKey="day"
                  tick={{ fill: "#5b6f69", fontSize: 10 }}
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
                  formatter={(value, name) => [
                    formatYen(Number(value ?? 0)),
                    name === "net"
                      ? "日別収支"
                      : name === "running"
                        ? "累積収支"
                        : "目安ペース線",
                  ]}
                  labelFormatter={(day) => {
                    const d = `${day}`;
                    if (d === format(parseISO(period.start), "M/d")) {
                      return `${period.start}（期間初日）`;
                    }
                    return `${period.start.slice(0, 8)}${d.padStart(2, "0")}`;
                  }}
                  contentStyle={{
                    borderRadius: 8,
                    borderColor: "#c9d9d4",
                    fontSize: 12,
                  }}
                />
                <Legend
                  formatter={(v) =>
                    v === "net" ? "日別収支" : v === "running" ? "累積収支" : "目安ペース線"
                  }
                />
                <Bar yAxisId="left" dataKey="net" name="net" fill="#0f766e" radius={[3, 3, 0, 0]} />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="running"
                  name="running"
                  stroke="#b45309"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="guardRunning"
                  name="guardRunning"
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
                periodAlert.tone === "danger"
                  ? "bg-expense/10 text-expense"
                  : periodAlert.tone === "warn"
                    ? "bg-[#f59e0b]/10 text-[#b45309]"
                    : "bg-income/10 text-income"
              }`}
            >
              {periodAlert.tone === "danger"
                ? "警戒: 全体家計の消化ペースが速いです。"
                : periodAlert.tone === "warn"
                  ? "注意: このままだと貯金余力が薄くなります。"
                  : "順調: 余剰を残せるペースです。"}
              {" "}
              {periodAlert.latestDay}日時点で目安との差は{" "}
              {periodAlert.gap > 0 ? "+" : ""}
              {formatYen(periodAlert.gap)}。
              {" "}
              貯金目安を {formatYen(savingsTarget)} として見た場合、
              期末見込み収支は{" "}
              <span className="font-semibold tabular-nums">
                {periodAlert.projectedNet > 0 ? "+" : ""}
                {formatYen(periodAlert.projectedNet)}
              </span>
              {" "}
              です。
            </div>
            {firstDaySummary.count > 0 ? (
              <p className="mt-2 rounded-md bg-white/70 px-2.5 py-1.5 text-xs text-muted">
                初日（{firstDaySummary.date}）内訳: 収入{" "}
                <span className="tabular-nums text-income">{formatYen(firstDaySummary.income)}</span>
                {" / "}
                支出{" "}
                <span className="tabular-nums text-expense">{formatYen(firstDaySummary.expense)}</span>
                {" / "}
                純増減{" "}
                <span
                  className={`tabular-nums ${firstDaySummary.net >= 0 ? "text-income" : "text-expense"}`}
                >
                  {firstDaySummary.net > 0 ? "+" : ""}
                  {formatYen(firstDaySummary.net)}
                </span>
                {"（"}
                {firstDaySummary.count}
                件）
              </p>
            ) : null}
          </>
        ) : (
          <EmptyChart />
        )}
      </div>
    </section>
  );
}

function EmptyChart() {
  return (
    <p className="mt-6 rounded-lg border border-dashed border-line px-4 py-10 text-center text-sm text-muted">
      この期間の記録がまだないのでグラフは空です
    </p>
  );
}
