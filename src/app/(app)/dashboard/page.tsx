import { PeriodNav } from "@/components/month-nav";
import { StatBlock, type StatLine } from "@/components/stat-block";
import { LedgerList } from "@/components/ledger-list";
import { AssetAccountsPanel } from "@/components/asset-accounts-panel";
import { PeriodCharts } from "@/components/period-charts";
import { PayslipImportPanel } from "@/components/payslip-import-panel";
import { PayslipDetailPanel } from "@/components/payslip-detail-panel";
import Link from "next/link";
import { format } from "date-fns";
import {
  buildAccountEndingForecasts,
  buildCashflowForecast,
  buildPeriodLedger,
  categoryBreakdown,
  currentPeriodKey,
  formatYen,
  getPeriodRange,
  ledgerPeriodAccountStats,
  mergeLedgerWithTransfers,
  summarizeLedger,
  type LedgerItem,
} from "@/lib/money";
import {
  fetchAccountBalanceSnapshots,
  fetchAccountTransfers,
  fetchAccountTransfersInRange,
  fetchAllTransactions,
  fetchAssetAccounts,
  fetchCardPayments,
  fetchCreditCards,
  fetchLoanPayments,
  fetchLoans,
  fetchPayslipImportsInRange,
  fetchRecurringRules,
  fetchSettings,
  fetchSnapshots,
  fetchTransactionsInRange,
  latestAccountBalances,
  sumLatestTotalAssets,
} from "@/lib/data";
import { listPayslipFiles } from "@/lib/payslip-pdf";
import { assetAccountKindLabel, type PeriodKey } from "@/lib/types";

type Props = {
  searchParams: Promise<{
    period?: string;
    month?: string;
  }>;
};

function itemLabel(item: LedgerItem): string {
  return (
    item.memo?.replace(/（.*）$/, "") ||
    item.category_name ||
    "未分類"
  );
}

function toLines(
  items: LedgerItem[],
  opts?: { asExpense?: boolean },
): StatLine[] {
  return items.map((item) => ({
    label: `${item.date.slice(5)} ${itemLabel(item)}`,
    amount: opts?.asExpense ? item.amount : item.kind === "income" ? item.amount : -item.amount,
    projected: item.isProjected,
  }));
}

function sumFormula(lines: StatLine[], total: number, asExpense = false): string {
  if (lines.length === 0) return "";
  if (lines.length === 1) {
    return asExpense
      ? `${formatYen(lines[0].amount)} = ${formatYen(total)}`
      : `${formatYen(lines[0].amount)} = ${formatYen(total)}`;
  }
  const parts = lines.map((l) => formatYen(l.amount));
  return `${parts.join(" + ")} = ${formatYen(total)}`;
}

export default async function DashboardPage({ searchParams }: Props) {
  const params = await searchParams;
  const settings = await fetchSettings();
  const periodKey = (params.period ??
    params.month ??
    currentPeriodKey(settings)) as PeriodKey;
  const period = getPeriodRange(periodKey, settings);
  const today = format(new Date(), "yyyy-MM-dd");

  const [
    monthTx,
    allTx,
    rules,
    snapshots,
    accountSnaps,
    accounts,
    transfers,
    allTransfers,
    cardPayments,
    loans,
    cards,
    loanPayments,
    payslipFiles,
    payslipImports,
  ] = await Promise.all([
    fetchTransactionsInRange(period.start, period.end),
    fetchAllTransactions(),
    fetchRecurringRules(),
    fetchSnapshots(),
    fetchAccountBalanceSnapshots(),
    fetchAssetAccounts(),
    fetchAccountTransfersInRange(period.start, period.end),
    fetchAccountTransfers(),
    fetchCardPayments(),
    fetchLoans(),
    fetchCreditCards(),
    fetchLoanPayments(),
    listPayslipFiles(),
    fetchPayslipImportsInRange(period.start, period.end),
  ]);

  const mainAccountId = accounts.find((a) => a.is_main)?.id ?? null;
  const accountIds = accounts.filter((a) => !a.archived).map((a) => a.id);
  const accountNameById = new Map(accounts.map((a) => [a.id, a.name]));
  const { total: totalAssets, asOfDate: totalAsOf } = sumLatestTotalAssets(
    accounts,
    accountSnaps,
    today,
  );

  const baseLedger = buildPeriodLedger(
    period,
    monthTx,
    rules,
    cardPayments,
    loans,
    cards,
    loanPayments,
  );
  const ledger = mergeLedgerWithTransfers(
    baseLedger,
    transfers,
    accountNameById,
    period,
  );
  const summary = summarizeLedger(ledger);
  const accountForecasts = buildAccountEndingForecasts(
    accountIds,
    accountSnaps,
    ledger,
    mainAccountId,
    today,
    today,
  );

  const forecast = buildCashflowForecast(
    periodKey,
    1,
    settings,
    allTx,
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
      transfers: allTransfers,
      accountNameById,
    },
  );
  const endingDisplay = forecast[0]?.endingBalance ??
    accountForecasts.reduce((s, a) => s + a.endingBalance, 0);

  const breakdown = categoryBreakdown(ledger);
  const maxBreakdown = Math.max(...breakdown.map((b) => b.amount), 1);

  const incomeItems = ledger.filter(
    (i) => i.kind === "income" && i.source !== "transfer",
  );
  const otherExpenseItems = ledger.filter(
    (i) =>
      i.kind === "expense" &&
      i.source !== "card" &&
      i.source !== "loan" &&
      i.source !== "transfer",
  );
  const emoneyAccountIds = new Set(
    accounts.filter((a) => a.kind === "emoney").map((a) => a.id),
  );
  const resolveAccountId = (item: LedgerItem) =>
    item.asset_account_id ?? mainAccountId;
  const emoneyExpenseItems = otherExpenseItems.filter((i) => {
    const id = resolveAccountId(i);
    return id != null && emoneyAccountIds.has(id);
  });
  const bankOtherExpenseItems = otherExpenseItems.filter((i) => {
    const id = resolveAccountId(i);
    return id == null || !emoneyAccountIds.has(id);
  });
  const emoneyExpense = emoneyExpenseItems.reduce((s, i) => s + i.amount, 0);
  const bankOtherExpense = bankOtherExpenseItems.reduce(
    (s, i) => s + i.amount,
    0,
  );
  const cardItems = ledger.filter((i) => i.source === "card");
  const loanItems = ledger.filter((i) => i.source === "loan");
  const allExpenseItems = ledger.filter(
    (i) => i.kind === "expense" && i.source !== "transfer",
  );

  const incomeLines = toLines(incomeItems);
  const emoneyLines = toLines(emoneyExpenseItems, { asExpense: true });
  const otherLines = toLines(bankOtherExpenseItems, { asExpense: true });
  const cardLines = toLines(cardItems, { asExpense: true });
  const loanLines = toLines(loanItems, { asExpense: true });
  const expenseLines = toLines(allExpenseItems, { asExpense: true });

  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const endingLines: StatLine[] = accountForecasts.map((f) => {
    const acc = accountById.get(f.accountId);
    const label = acc
      ? `${assetAccountKindLabel(acc.kind)} · ${acc.name}`
      : f.accountId;
    const hint = f.asOf
      ? `${f.asOf}残高 ${formatYen(f.balance)} ＋ 以降 ${formatYen(f.appliedNet)}`
      : `残高未登録 · 今期純増減 ${formatYen(f.appliedNet)}`;
    return {
      label: `${label}（${hint}）`,
      amount: f.endingBalance,
    };
  });
  const endingFormula =
    endingLines.length > 0
      ? `${endingLines.map((l) => formatYen(l.amount)).join(" ＋ ")} ＝ ${formatYen(endingDisplay)}`
      : undefined;

  const latestMap = latestAccountBalances(accounts, accountSnaps);
  const latestByAccount: Record<string, (typeof accountSnaps)[0] | undefined> =
    {};
  for (const [id, snap] of latestMap) {
    latestByAccount[id] = snap;
  }
  const periodStats = ledgerPeriodAccountStats(ledger, mainAccountId);

  const totalAssetLines: StatLine[] = accounts.flatMap((a) => {
    const snap = latestByAccount[a.id];
    if (!snap) return [];
    return [
      {
        label: `${assetAccountKindLabel(a.kind)} · ${a.name}`,
        amount: snap.balance,
      },
    ];
  });
  const unregisteredCount = accounts.filter((a) => !latestByAccount[a.id]).length;
  const totalAssetFormula =
    totalAssetLines.length > 0
      ? `${totalAssetLines.map((l) => formatYen(l.amount)).join(" ＋ ")} ＝ ${formatYen(totalAssets)}`
      : undefined;

  const forecastByAccount = Object.fromEntries(
    accountForecasts.map((f) => [f.accountId, f]),
  );

  return (
    <div className="grid gap-6">
      <PeriodNav
        period={period}
        basePath="/dashboard"
        exportHref={`/api/export/period?period=${periodKey}`}
      />

      <p className="rounded-xl border border-line/80 bg-white/60 px-4 py-3 text-sm text-muted">
            この期間は給料日（{period.payday}）から次の給料日前日（{period.end}
            ）までの全体家計です。数値下の内訳は実額確定後に確定額へ更新されます（未確定は「予定」）。
            期末予測は各口座の実残高＋その口座の更新日翌日以降の収支の合計です。
      </p>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatBlock
          label="総資産（最新）"
          value={totalAssets}
          tone="balance"
          hint={
            totalAsOf
              ? `口座＋電子マネーの最新残高合計${
                  unregisteredCount > 0
                    ? `（未登録 ${unregisteredCount}）`
                    : ""
                }`
              : "残高未登録"
          }
          lines={totalAssetLines.length > 0 ? totalAssetLines : undefined}
          formula={totalAssetFormula}
        />
        <StatBlock
          label="収入"
          value={summary.income}
          tone="income"
          lines={incomeLines}
          formula={sumFormula(incomeLines, summary.income)}
        />
        <StatBlock
          label="支出（合計）"
          value={summary.expense}
          tone="expense"
          lines={expenseLines}
          formula={
            expenseLines.length > 0
              ? `電子マネー ${formatYen(emoneyExpense)} + 通常 ${formatYen(bankOtherExpense)} + カード ${formatYen(summary.cardExpense)} + ローン ${formatYen(summary.loanExpense)} = ${formatYen(summary.expense)}`
              : undefined
          }
        />
        <div className="grid gap-2">
          <StatBlock
            label="期末予測残高"
            value={endingDisplay}
            tone="balance"
            hint="口座・電子マネーの期末予定の合計"
            lines={endingLines.length > 0 ? endingLines : undefined}
            formula={endingFormula}
          />
          <Link
            href={`/dashboard/daily-balance?period=${periodKey}`}
            className="rounded-md border border-line bg-white px-3 py-2 text-center text-sm hover:bg-white"
          >
            日別推移を見る
          </Link>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatBlock
          label="電子マネー"
          value={emoneyExpense}
          tone="expense"
          hint={
            emoneyAccountIds.size > 0
              ? `残高合計 ${formatYen(
                  accounts
                    .filter((a) => a.kind === "emoney")
                    .reduce(
                      (s, a) => s + (latestByAccount[a.id]?.balance ?? 0),
                      0,
                    ),
                )}（総資産に含む）`
              : "電子マネー未登録（下の口座パネルから追加）"
          }
          lines={emoneyLines.length > 0 ? emoneyLines : undefined}
          formula={
            emoneyLines.length > 0
              ? sumFormula(emoneyLines, emoneyExpense, true)
              : undefined
          }
        />
        <StatBlock
          label="通常支出"
          value={bankOtherExpense}
          tone="expense"
          lines={otherLines}
          formula={sumFormula(otherLines, bankOtherExpense, true)}
        />
        <StatBlock
          label="カード引落"
          value={summary.cardExpense}
          tone="expense"
          lines={cardLines}
          formula={sumFormula(cardLines, summary.cardExpense, true)}
        />
        <StatBlock
          label="ローン"
          value={summary.loanExpense}
          tone="expense"
          lines={loanLines}
          formula={sumFormula(loanLines, summary.loanExpense, true)}
        />
      </section>

      <AssetAccountsPanel
        accounts={accounts}
        snapshots={accountSnaps}
        latestByAccount={latestByAccount}
        periodStats={periodStats}
        mainAccountId={mainAccountId}
        totalAssets={totalAssets}
        totalAsOf={totalAsOf}
        totalEnding={endingDisplay}
        forecastByAccount={forecastByAccount}
        transfers={transfers}
        today={today}
      />

      <PeriodCharts period={period} ledger={ledger.filter((i) => i.source !== "transfer")} />

      <PayslipDetailPanel imports={payslipImports} />

      <PayslipImportPanel files={payslipFiles} />

      <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="grid gap-3">
          <h2 className="text-lg font-bold">期間内の明細</h2>
          <LedgerList items={ledger.filter((i) => i.source !== "transfer")} />
        </div>
        <div className="grid gap-3">
          <h2 className="text-lg font-bold">支出の内訳</h2>
          {breakdown.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line bg-white/50 px-4 py-8 text-center text-sm text-muted">
              支出データがありません
            </p>
          ) : (
            <ul className="grid gap-2 rounded-xl border border-line/80 bg-surface p-4">
              {breakdown.map((b) => (
                <li key={b.name} className="grid gap-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ background: b.color }}
                      />
                      {b.name}
                    </span>
                    <span className="tabular-nums">{formatYen(b.amount)}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-line/50">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(b.amount / maxBreakdown) * 100}%`,
                        background: b.color,
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
