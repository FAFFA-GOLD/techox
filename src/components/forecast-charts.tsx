"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CashflowRow } from "@/lib/types";

type Props = {
  rows: CashflowRow[];
};

const FORECAST_SAFETY_BALANCE = 30000;
const FORECAST_SAVINGS_TARGET = 14000;

function yenTick(n: number): string {
  if (Math.abs(n) >= 10000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

function shortLabel(key: string): string {
  const [y, m] = key.split("-");
  return `${y.slice(2)}/${Number(m)}`;
}

export function ForecastCharts({ rows }: Props) {
  const data = rows.map((r) => ({
    period: shortLabel(r.period.key),
    endingBalance: r.endingBalance,
    net: r.net,
    savingsTarget: FORECAST_SAVINGS_TARGET,
    safetyBalance: FORECAST_SAFETY_BALANCE,
    expenseOther: r.expenseOther,
    cardExpense: r.cardExpense,
    loanExpense: r.loanExpense,
    hasProjected: r.projectedIncome + r.projectedExpense > 0,
  }));

  const hasAny = rows.length > 0;
  const firstCashoutIdx = rows.findIndex((r) => r.endingBalance < 0);
  const firstSafetyIdx = rows.findIndex(
    (r) => r.endingBalance < FORECAST_SAFETY_BALANCE,
  );
  const savingsHitCount = rows.filter((r) => r.net >= FORECAST_SAVINGS_TARGET).length;
  const savingsRate = rows.length > 0 ? Math.round((savingsHitCount / rows.length) * 100) : 0;

  return (
    <section className="grid gap-4 lg:grid-cols-2">
      {hasAny ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:col-span-2 lg:grid-cols-3">
          <div className="rounded-xl border border-line/80 bg-surface px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide text-muted">資金ショート予兆</p>
            {firstCashoutIdx >= 0 ? (
              <>
                <p className="mt-1 text-sm font-semibold text-expense">
                  {firstCashoutIdx <= 0 ? "警戒" : firstCashoutIdx === 1 ? "注意" : "先で注意"}
                </p>
                <p className="text-xs text-muted">
                  {shortLabel(rows[firstCashoutIdx].period.key)} 期で 0円割れ見込み
                </p>
              </>
            ) : (
              <>
                <p className="mt-1 text-sm font-semibold text-income">安全</p>
                <p className="text-xs text-muted">表示範囲内で 0円割れなし</p>
              </>
            )}
          </div>

          <div className="rounded-xl border border-line/80 bg-surface px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide text-muted">安全余力</p>
            {firstSafetyIdx >= 0 ? (
              <>
                <p
                  className={`mt-1 text-sm font-semibold ${
                    firstSafetyIdx <= 1 ? "text-expense" : "text-[#b45309]"
                  }`}
                >
                  {firstSafetyIdx <= 1 ? "警戒" : "注意"}
                </p>
                <p className="text-xs text-muted">
                  {shortLabel(rows[firstSafetyIdx].period.key)} 期で {FORECAST_SAFETY_BALANCE.toLocaleString()} 円未満
                </p>
              </>
            ) : (
              <>
                <p className="mt-1 text-sm font-semibold text-income">余力あり</p>
                <p className="text-xs text-muted">
                  期末残高が {FORECAST_SAFETY_BALANCE.toLocaleString()} 円以上を維持
                </p>
              </>
            )}
          </div>

          <div className="rounded-xl border border-line/80 bg-surface px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide text-muted">貯金目標達成率</p>
            <p
              className={`mt-1 text-sm font-semibold tabular-nums ${
                savingsRate >= 100 ? "text-income" : savingsRate >= 70 ? "text-[#b45309]" : "text-expense"
              }`}
            >
              {savingsRate}%
            </p>
            <p className="text-xs text-muted">
              {rows.length}期中 {savingsHitCount}期が +{FORECAST_SAVINGS_TARGET.toLocaleString()} 円以上
            </p>
          </div>
        </div>
      ) : null}

      <div className="rounded-xl border border-line/80 bg-surface p-4 lg:col-span-2">
        <h2 className="text-sm font-bold">期末残高の推移</h2>
        <p className="mt-0.5 text-xs text-muted">
          棒は期ごとの差額、線は期末残高。先のキャッシュアウト時期を見つけやすくします。
        </p>
        {hasAny ? (
          <div className="mt-3 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#c9d9d4" />
                <XAxis
                  dataKey="period"
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
                    new Intl.NumberFormat("ja-JP").format(Number(value ?? 0)),
                    name === "net"
                      ? "差額"
                      : name === "endingBalance"
                        ? "期末残高"
                        : "安全余力ライン",
                  ]}
                  contentStyle={{
                    borderRadius: 8,
                    borderColor: "#c9d9d4",
                    fontSize: 12,
                  }}
                />
                <Legend
                  formatter={(v) =>
                    v === "net" ? "差額" : v === "endingBalance" ? "期末残高" : "安全余力ライン"
                  }
                />
                <Bar yAxisId="left" dataKey="net" name="net" fill="#0f766e" radius={[3, 3, 0, 0]} />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="endingBalance"
                  name="endingBalance"
                  stroke="#b45309"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="safetyBalance"
                  name="safetyBalance"
                  stroke="#475569"
                  strokeDasharray="5 5"
                  strokeWidth={1.5}
                  dot={false}
                  activeDot={{ r: 3 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyChart />
        )}
      </div>

      <div className="rounded-xl border border-line/80 bg-surface p-4 lg:col-span-2">
        <h2 className="text-sm font-bold">支出構成の推移</h2>
        <p className="mt-0.5 text-xs text-muted">
          通常支出・カード・ローンの変化。どの要因で圧迫されるかを期ごとに確認できます。
        </p>
        {hasAny ? (
          <div className="mt-3 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#c9d9d4" />
                <XAxis
                  dataKey="period"
                  tick={{ fill: "#5b6f69", fontSize: 10 }}
                  axisLine={{ stroke: "#c9d9d4" }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tickFormatter={yenTick}
                  tick={{ fill: "#5b6f69", fontSize: 11 }}
                  axisLine={{ stroke: "#c9d9d4" }}
                  width={44}
                />
                <Tooltip
                  formatter={(value, name) => [
                    new Intl.NumberFormat("ja-JP").format(Number(value ?? 0)),
                    name === "expenseOther"
                      ? "通常支出"
                      : name === "cardExpense"
                        ? "カード"
                        : name === "loanExpense"
                          ? "ローン"
                          : "目標貯金",
                  ]}
                  contentStyle={{
                    borderRadius: 8,
                    borderColor: "#c9d9d4",
                    fontSize: 12,
                  }}
                />
                <Legend
                  formatter={(v) =>
                    v === "expenseOther"
                      ? "通常支出"
                      : v === "cardExpense"
                        ? "カード"
                        : v === "loanExpense"
                          ? "ローン"
                          : "目標貯金"
                  }
                />
                <Bar dataKey="expenseOther" stackId="exp" fill="#b45309" radius={[3, 3, 0, 0]} />
                <Bar dataKey="cardExpense" stackId="exp" fill="#0369a1" radius={[3, 3, 0, 0]} />
                <Bar dataKey="loanExpense" stackId="exp" fill="#9a3412" radius={[3, 3, 0, 0]} />
                <Line
                  type="monotone"
                  dataKey="savingsTarget"
                  name="savingsTarget"
                  stroke="#0f766e"
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                  dot={false}
                  activeDot={{ r: 3 }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
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
      表示できる将来データがまだありません
    </p>
  );
}
