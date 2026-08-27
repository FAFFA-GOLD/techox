import Link from "next/link";
import { PeriodNav } from "@/components/month-nav";
import {
  buildDailyBalanceRows,
  buildPeriodLedger,
  computeTotalAssetsBase,
  currentPeriodKey,
  formatYen,
  getPeriodRange,
} from "@/lib/money";
import {
  fetchAccountBalanceSnapshots,
  fetchAssetAccounts,
  fetchCardPayments,
  fetchCreditCards,
  fetchLoanPayments,
  fetchLoans,
  fetchRecurringRules,
  fetchSettings,
  fetchTransactionsInRange,
} from "@/lib/data";
import type { BalanceSnapshot, PeriodKey } from "@/lib/types";
import { addDays, format, parseISO } from "date-fns";

type Props = {
  searchParams: Promise<{ period?: string; month?: string }>;
};

/** 総資産ベースの疑似スナップショット（日別推移第1弾） */
function syntheticTotalSnapshots(
  accountIds: string[],
  accountSnaps: {
    asset_account_id: string;
    as_of_date: string;
    balance: number;
  }[],
): BalanceSnapshot[] {
  const dates = [
    ...new Set(accountSnaps.map((s) => s.as_of_date)),
  ].sort();
  return dates.map((d) => {
    const base = computeTotalAssetsBase(accountIds, accountSnaps, d);
    return {
      id: `total-${d}`,
      user_id: "",
      as_of_date: d,
      balance: base.balance,
      note: null,
      created_at: "",
    };
  });
}

export default async function DailyBalancePage({ searchParams }: Props) {
  const params = await searchParams;
  const settings = await fetchSettings();
  const periodKey = (params.period ??
    params.month ??
    currentPeriodKey(settings)) as PeriodKey;
  const period = getPeriodRange(periodKey, settings);

  const [
    monthTx,
    rules,
    accountSnaps,
    accounts,
    cardPayments,
    loans,
    cards,
    loanPayments,
  ] = await Promise.all([
    fetchTransactionsInRange(period.start, period.end),
    fetchRecurringRules(),
    fetchAccountBalanceSnapshots(),
    fetchAssetAccounts(),
    fetchCardPayments(),
    fetchLoans(),
    fetchCreditCards(),
    fetchLoanPayments(),
  ]);

  const accountIds = accounts.filter((a) => !a.archived).map((a) => a.id);
  const snapshots = syntheticTotalSnapshots(accountIds, accountSnaps);

  const ledger = buildPeriodLedger(
    period,
    monthTx,
    rules,
    cardPayments,
    loans,
    cards,
    loanPayments,
  );
  const { startBalance, startAsOf, rows } = buildDailyBalanceRows(
    period,
    ledger,
    snapshots,
  );

  const gaps = rows.filter((r) => r.gap != null && r.gap !== 0);
  const activeRows = rows.filter(
    (r) =>
      r.movements.length > 0 ||
      r.registeredBalance != null ||
      r.date === period.start ||
      r.date === period.end,
  );

  return (
    <div className="grid gap-6">
      <div>
        <p className="text-sm text-muted">
          <Link href={`/dashboard?period=${periodKey}`} className="hover:text-ink">
            ← 全体家計
          </Link>
        </p>
        <h1 className="text-xl font-bold">日別残高推移</h1>
        <p className="mt-1 text-sm text-muted">
          総資産（全口座の最新残高合計）を起点にした推移です。登録残高は同日時点の総資産との突合用です。
        </p>
      </div>

      <PeriodNav period={period} basePath="/dashboard/daily-balance" />

      <section className="rounded-xl border border-line/80 bg-surface px-4 py-3 text-sm">
        <p className="text-muted">起点残高（総資産）</p>
        <p className="mt-1 text-lg font-bold tabular-nums text-accent-deep">
          {formatYen(startBalance)}
        </p>
        <p className="text-xs text-muted">
          {startAsOf
            ? `${startAsOf} 時点（期間開始 ${period.start} の前日以前）`
            : "口座残高未登録のため 0 から計算"}
          {" · "}
          期間開始前日は{" "}
          {format(addDays(parseISO(period.start), -1), "yyyy-MM-dd")}
        </p>
      </section>

      {gaps.length > 0 ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-900">
          登録総資産と台帳ベースの差額がある日が {gaps.length} 日あります（下表の「差」列）。
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-line/80 bg-surface">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-line/70 bg-white/60 text-xs text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">日付</th>
              <th className="px-3 py-2 font-medium text-right">始</th>
              <th className="px-3 py-2 font-medium text-right">入</th>
              <th className="px-3 py-2 font-medium text-right">出</th>
              <th className="px-3 py-2 font-medium text-right">終</th>
              <th className="px-3 py-2 font-medium text-right">登録総資産</th>
              <th className="px-3 py-2 font-medium text-right">差</th>
              <th className="px-3 py-2 font-medium">動き</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/50">
            {(activeRows.length > 0 ? activeRows : rows).map((r) => (
              <tr key={r.date} className="align-top">
                <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                  {r.date.slice(5)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-muted">
                  {formatYen(r.opening)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-income">
                  {r.income ? formatYen(r.income) : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-expense">
                  {r.expense ? formatYen(r.expense) : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-medium">
                  {formatYen(r.closing)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-muted">
                  {r.registeredBalance != null
                    ? formatYen(r.registeredBalance)
                    : "—"}
                </td>
                <td
                  className={`px-3 py-2 text-right tabular-nums ${
                    r.gap == null
                      ? "text-muted"
                      : r.gap === 0
                        ? "text-muted"
                        : r.gap > 0
                          ? "text-income"
                          : "text-expense"
                  }`}
                >
                  {r.gap == null
                    ? "—"
                    : r.gap === 0
                      ? "0"
                      : `${r.gap > 0 ? "+" : ""}${formatYen(r.gap)}`}
                </td>
                <td className="max-w-xs px-3 py-2 text-xs text-muted">
                  {r.movements.length === 0
                    ? "—"
                    : r.movements
                        .map(
                          (m) =>
                            `${m.projected ? "予 " : ""}${m.label} ${
                              m.kind === "income" ? "+" : "-"
                            }${formatYen(m.amount)}`,
                        )
                        .join(" / ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
