import Link from "next/link";
import { Fragment } from "react";
import { PeriodNav } from "@/components/month-nav";
import { ForecastCharts } from "@/components/forecast-charts";
import { format } from "date-fns";
import {
  buildCashflowForecast,
  computeTotalAssetsBase,
  currentPeriodKey,
  formatYen,
  getPeriodRange,
  shiftPeriod,
} from "@/lib/money";
import {
  fetchAccountBalanceSnapshots,
  fetchAccountTransfers,
  fetchAllTransactions,
  fetchAssetAccounts,
  fetchCardPayments,
  fetchCreditCards,
  fetchLoanPayments,
  fetchLoans,
  fetchRecurringRules,
  fetchSettings,
  fetchSnapshots,
} from "@/lib/data";
import type { CashflowRow, PeriodKey } from "@/lib/types";

type Props = {
  searchParams: Promise<{ period?: string; months?: string }>;
};

function periodShortLabel(key: PeriodKey): string {
  const [y, m] = key.split("-");
  return `${y}/${Number(m)}`;
}

function yenCompact(n: number): string {
  return new Intl.NumberFormat("ja-JP").format(n);
}

function rowBg(row: CashflowRow, currentKey: PeriodKey): string {
  if (row.endingBalance < 0) return "bg-red-50/80";
  if (row.period.key === currentKey) return "bg-accent/5";
  return "bg-white/80";
}

function stickyBg(row: CashflowRow, currentKey: PeriodKey): string {
  if (row.endingBalance < 0) return "bg-red-50";
  if (row.period.key === currentKey) return "bg-[#e8f3f0]";
  return "bg-[#fbfdfc]";
}

export default async function ForecastPage({ searchParams }: Props) {
  const params = await searchParams;
  const settings = await fetchSettings();
  const currentKey = currentPeriodKey(settings);
  const periodKey = (params.period ?? currentKey) as PeriodKey;
  const periodsAhead = Math.min(60, Math.max(12, Number(params.months) || 24));
  const period = getPeriodRange(periodKey, settings);

  const today = format(new Date(), "yyyy-MM-dd");
  const [
    transactions,
    rules,
    snapshots,
    accountSnaps,
    accounts,
    transfers,
    cardPayments,
    loans,
    cards,
    loanPayments,
  ] = await Promise.all([
    fetchAllTransactions(),
    fetchRecurringRules(),
    fetchSnapshots(),
    fetchAccountBalanceSnapshots(),
    fetchAssetAccounts(),
    fetchAccountTransfers(),
    fetchCardPayments(),
    fetchLoans(),
    fetchCreditCards(),
    fetchLoanPayments(),
  ]);

  const accountIds = accounts.filter((a) => !a.archived).map((a) => a.id);
  const mainAccountId = accounts.find((a) => a.is_main)?.id ?? null;
  const accountNameById = new Map(accounts.map((a) => [a.id, a.name]));
  const { balance: totalAssets, asOf: totalAsOf } = computeTotalAssetsBase(
    accountIds,
    accountSnaps,
    today,
  );

  const rows = buildCashflowForecast(
    periodKey,
    periodsAhead,
    settings,
    transactions,
    rules,
    snapshots,
    cardPayments,
    loans,
    cards,
    loanPayments,
    today,
    null,
    {
      accountIds,
      accountSnapshots: accountSnaps,
      mainAccountId,
      transfers,
      accountNameById,
    },
  );

  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.endingBalance)), 1);
  const minBalance = rows.reduce(
    (min, r) => Math.min(min, r.endingBalance),
    Number.POSITIVE_INFINITY,
  );
  const firstNegative = rows.find((r) => r.endingBalance < 0) ?? null;
  const projectedRows = rows.filter(
    (r) => r.projectedIncome + r.projectedExpense > 0,
  ).length;
  const endKey = shiftPeriod(periodKey, periodsAhead - 1);

  const yearBreakKeys = new Set<string>();
  let prevYear = "";
  for (const row of rows) {
    const year = row.period.key.slice(0, 4);
    if (year !== prevYear) {
      yearBreakKeys.add(row.period.key);
      prevYear = year;
    }
  }

  return (
    <div className="grid gap-5">
      <PeriodNav
        period={period}
        basePath="/forecast"
        keepQuery={{ months: String(periodsAhead) }}
      />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">長期キャッシュフロー</h2>
          <p className="mt-1 text-sm text-muted">
            Excelの長期表と同じく、給料サイクルごとの収支と期末残高を並べて見ます。行から全体家計の詳細へ移動できます。
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          {[12, 24, 36, 60].map((n) => (
            <Link
              key={n}
              href={`/forecast?period=${periodKey}&months=${n}`}
              className={`rounded-md border px-3 py-1.5 ${
                periodsAhead === n
                  ? "border-accent bg-accent text-white"
                  : "border-line bg-white/80 text-muted"
              }`}
            >
              {n}期
            </Link>
          ))}
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-line/80 bg-surface px-4 py-3">
          <p className="text-[11px] uppercase tracking-wide text-muted">表示範囲</p>
          <p className="mt-1 text-sm font-medium">
            {periodShortLabel(periodKey)} 〜 {periodShortLabel(endKey)}
          </p>
          <p className="text-xs text-muted">{periodsAhead} 期間</p>
        </div>
        <div className="rounded-xl border border-line/80 bg-surface px-4 py-3">
          <p className="text-[11px] uppercase tracking-wide text-muted">起点・総資産</p>
          <p className="mt-1 text-sm font-medium tabular-nums">
            {totalAsOf ? formatYen(totalAssets) : "未登録"}
          </p>
          <p className="text-xs text-muted">
            {totalAsOf
              ? `各口座の最新残高合計（口座ごとの基準日で予測）`
              : "ダッシュボードで口座残高を登録"}
          </p>
        </div>
        <div className="rounded-xl border border-line/80 bg-surface px-4 py-3">
          <p className="text-[11px] uppercase tracking-wide text-muted">最下点残高</p>
          <p
            className={`mt-1 text-sm font-medium tabular-nums ${
              minBalance < 0 ? "text-expense" : "text-income"
            }`}
          >
            {Number.isFinite(minBalance) ? formatYen(minBalance) : "—"}
          </p>
          <p className="text-xs text-muted">表示期間内の最小期末残高</p>
        </div>
        <div className="rounded-xl border border-line/80 bg-surface px-4 py-3">
          <p className="text-[11px] uppercase tracking-wide text-muted">
            キャッシュアウト注意
          </p>
          {firstNegative ? (
            <>
              <p className="mt-1 text-sm font-medium text-expense">
                {periodShortLabel(firstNegative.period.key)} 期末がマイナス
              </p>
              <p className="text-xs text-muted">
                {formatYen(firstNegative.endingBalance)}
              </p>
            </>
          ) : (
            <>
              <p className="mt-1 text-sm font-medium text-income">期間内はプラス維持</p>
              <p className="text-xs text-muted">
                予定込み {projectedRows} 期に未確定あり
              </p>
            </>
          )}
        </div>
      </section>

      <div className="flex flex-wrap gap-3 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-accent/15 ring-1 ring-accent/30" />
          いまの全体家計
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-red-50 ring-1 ring-red-200" />
          期末残高マイナス
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="rounded bg-accent/10 px-1 py-0.5 text-[10px] text-accent">
            予定
          </span>
          未確定の予定を含む
        </span>
      </div>

      {!totalAsOf ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          総資産（口座残高）が未設定です。全体家計で口座残高を入れると予測が正確になります。
        </p>
      ) : null}

      <ForecastCharts rows={rows} />

      <div className="max-h-[70vh] overflow-auto rounded-xl border border-line/80 bg-white/90 shadow-[0_12px_40px_-28px_rgba(15,40,35,0.5)]">
        <table className="w-full min-w-[980px] border-collapse text-sm">
          <thead className="sticky top-0 z-20">
            <tr className="border-b border-line bg-[#eef5f3] text-[11px] font-medium text-muted">
              <th className="sticky left-0 z-30 bg-[#eef5f3] px-3 py-2.5 text-left">
                期間
              </th>
              <th className="px-3 py-2.5 text-right">収入</th>
              <th className="px-3 py-2.5 text-right">通常支出</th>
              <th className="px-3 py-2.5 text-right">カード</th>
              <th className="px-3 py-2.5 text-right">ローン</th>
              <th className="px-3 py-2.5 text-right">支出計</th>
              <th className="px-3 py-2.5 text-right">差額</th>
              <th className="px-3 py-2.5 text-right">期末残高</th>
              <th className="min-w-[7rem] px-3 py-2.5 text-left">残高推移</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const hasProj = row.projectedIncome + row.projectedExpense > 0;
              const isCurrent = row.period.key === currentKey;
              const isNeg = row.endingBalance < 0;
              const showYear = yearBreakKeys.has(row.period.key);
              const year = row.period.key.slice(0, 4);

              return (
                <Fragment key={row.period.key}>
                  {showYear ? (
                    <tr className="border-y border-line/80 bg-[#f7faf9]">
                      <td
                        colSpan={9}
                        className="sticky left-0 px-3 py-1.5 text-[11px] font-bold tracking-wide text-accent-deep"
                      >
                        {year}年
                      </td>
                    </tr>
                  ) : null}
                  <tr className={`border-b border-line/50 hover:bg-white ${rowBg(row, currentKey)}`}>
                    <td
                      className={`sticky left-0 z-10 px-3 py-2 ${stickyBg(row, currentKey)}`}
                    >
                      <Link
                        href={`/dashboard?period=${row.period.key}`}
                        className="block"
                      >
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-semibold text-accent-deep">
                            {periodShortLabel(row.period.key)}
                          </span>
                          {isCurrent ? (
                            <span className="rounded bg-accent px-1 py-0.5 text-[10px] text-white">
                              今期
                            </span>
                          ) : null}
                          {hasProj ? (
                            <span className="rounded bg-accent/10 px-1 py-0.5 text-[10px] text-accent">
                              予定
                            </span>
                          ) : null}
                        </div>
                        <div className="text-[11px] text-muted">
                          {row.period.start.slice(5).replace("-", "/")}〜
                          {row.period.end.slice(5).replace("-", "/")}
                        </div>
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-income">
                      {yenCompact(row.income)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-expense">
                      {yenCompact(row.expenseOther)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-expense">
                      {yenCompact(row.cardExpense)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-expense">
                      {yenCompact(row.loanExpense)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-expense">
                      {yenCompact(row.expense)}
                    </td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums ${
                        row.net >= 0 ? "text-income" : "text-expense"
                      }`}
                    >
                      {row.net > 0 ? "+" : ""}
                      {yenCompact(row.net)}
                    </td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums font-semibold ${
                        isNeg ? "text-expense" : "text-income"
                      }`}
                    >
                      {yenCompact(row.endingBalance)}
                    </td>
                    <td className="px-3 py-2">
                      <div className="relative h-2 overflow-hidden rounded-full bg-line/40">
                        <div
                          className={`absolute top-0 h-full rounded-full ${
                            isNeg ? "bg-expense" : "bg-income"
                          }`}
                          style={{
                            width: `${(Math.abs(row.endingBalance) / maxAbs) * 100}%`,
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted">
        金額は円（カンマ区切り）。「予定」付きの行は未確定の定期・カード・ローンを含みます。実額確定すると数値が更新されます。
      </p>
    </div>
  );
}
