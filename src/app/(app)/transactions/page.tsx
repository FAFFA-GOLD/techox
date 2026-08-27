import Link from "next/link";
import { format } from "date-fns";
import { PeriodNav } from "@/components/month-nav";
import { TransactionForm } from "@/components/transaction-form";
import { LedgerList, type LedgerFilter } from "@/components/ledger-list";
import { TransactionsCsvPanel } from "@/components/transactions-csv-panel";
import {
  TransactionsTabs,
  type TransactionsTab,
} from "@/components/transactions-tabs";
import { CategoriesPanel } from "@/components/categories-panel";
import { RecurringPanel } from "@/components/recurring-panel";
import { CardsClient } from "@/components/cards-client";
import { LoansClient } from "@/components/loans-client";
import {
  buildPeriodLedger,
  currentPeriodKey,
  getPeriodRange,
} from "@/lib/money";
import { buildCardSchedule, buildLoanSchedule } from "@/lib/schedules";
import {
  fetchAssetAccounts,
  fetchCardPayments,
  fetchCategories,
  fetchCreditCards,
  fetchLoanPayments,
  fetchLoans,
  fetchRecurringRules,
  fetchSettings,
  fetchTransactionsInRange,
} from "@/lib/data";
import type { PeriodKey } from "@/lib/types";

type Props = {
  searchParams: Promise<{
    period?: string;
    month?: string;
    tab?: string;
    filter?: string;
    edit?: string;
    confirm?: string;
    csvMonth?: string;
    editCard?: string;
    confirmCard?: string;
    confirmDate?: string;
    editPayment?: string;
    confirmLoan?: string;
    card?: string;
    loan?: string;
  }>;
};

const TAB_IDS: TransactionsTab[] = [
  "list",
  "categories",
  "recurring",
  "cards",
  "loans",
];

const FILTERS: { id: LedgerFilter; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "normal", label: "通常" },
  { id: "recurring", label: "定期" },
  { id: "card", label: "カード" },
  { id: "loan", label: "ローン" },
];

function parseTab(raw: string | undefined): TransactionsTab {
  if (raw && (TAB_IDS as string[]).includes(raw)) {
    return raw as TransactionsTab;
  }
  return "list";
}

function parseFilter(raw: string | undefined): LedgerFilter {
  const allowed: LedgerFilter[] = [
    "all",
    "normal",
    "recurring",
    "card",
    "loan",
  ];
  if (raw && (allowed as string[]).includes(raw)) {
    return raw as LedgerFilter;
  }
  return "all";
}

export default async function TransactionsPage({ searchParams }: Props) {
  const params = await searchParams;
  const settings = await fetchSettings();
  const periodKey = (params.period ??
    params.month ??
    currentPeriodKey(settings)) as PeriodKey;
  const period = getPeriodRange(periodKey, settings);
  const tab = parseTab(params.tab);
  const filter = parseFilter(params.filter);
  const listBase = `/transactions?period=${periodKey}&tab=list`;
  const cardsBase = `/transactions?period=${periodKey}&tab=cards`;
  const loansBase = `/transactions?period=${periodKey}&tab=loans`;
  const categoriesBase = `/transactions?period=${periodKey}&tab=categories`;
  const recurringBase = `/transactions?period=${periodKey}&tab=recurring`;
  const csvMonth =
    params.csvMonth && /^\d{4}-\d{2}$/.test(params.csvMonth)
      ? params.csvMonth
      : format(new Date(), "yyyy-MM");

  const [
    categories,
    transactions,
    rules,
    cards,
    cardPayments,
    loans,
    loanPayments,
    accounts,
  ] = await Promise.all([
    fetchCategories(),
    fetchTransactionsInRange(period.start, period.end),
    fetchRecurringRules(),
    fetchCreditCards(),
    fetchCardPayments(),
    fetchLoans(),
    fetchLoanPayments(),
    fetchAssetAccounts(),
  ]);

  const ledger = buildPeriodLedger(
    period,
    transactions,
    rules,
    cardPayments,
    loans,
    cards,
    loanPayments,
  );

  const editing =
    tab === "list" && params.edit
      ? (transactions.find((t) => t.id === params.edit) ?? null)
      : null;

  const confirmItem =
    tab === "list" && !editing && params.confirm
      ? (ledger.find(
          (i) =>
            i.isProjected &&
            i.source === "recurring" &&
            i.recurring_rule_id === params.confirm,
        ) ?? null)
      : null;

  const confirming = confirmItem
    ? {
        date: confirmItem.date,
        amount: confirmItem.amount,
        kind: confirmItem.kind,
        category_id: confirmItem.category_id,
        memo: confirmItem.memo,
        recurring_rule_id: confirmItem.recurring_rule_id,
        asset_account_id: confirmItem.asset_account_id ?? null,
      }
    : null;

  const cardSchedule = buildCardSchedule(cards, cardPayments);
  const loanSchedule = buildLoanSchedule(loans, loanPayments);

  return (
    <div className="grid gap-6">
      <PeriodNav period={period} basePath="/transactions" keepQuery={{ tab }} />
      <div>
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">明細</h1>
        <p className="mt-1 text-sm text-muted">
          今の全体家計期間の一覧と、項目・定期・カード・ローンの設定をここでまとめて扱います。
        </p>
      </div>
      <TransactionsTabs periodKey={periodKey} active={tab} />

      {tab === "list" ? (
        <>
          <p className="rounded-xl border border-line/80 bg-white/60 px-4 py-3 text-sm text-muted">
            通常・定期・カード・ローンを一覧表示します。予定は「実額を確定」から登録できます（カード・ローンはそれぞれの設定タブでも確定できます）。
          </p>
          <TransactionForm
            key={editing?.id ?? confirming?.recurring_rule_id ?? "new"}
            categories={categories}
            accounts={accounts}
            defaultDate={period.payday}
            editing={editing}
            confirming={confirming}
            cancelHref={listBase}
          />
          {editing || confirming ? (
            <p className="text-sm text-muted">
              {editing ? "編集中" : "実額確定中"}です。{" "}
              <Link href={listBase} className="text-accent underline">
                新規追加に戻る
              </Link>
            </p>
          ) : null}
          <section className="grid gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-bold">期間内の明細</h2>
              <div className="flex flex-wrap gap-1">
                {FILTERS.map((f) => {
                  const href = `${listBase}&filter=${f.id}`;
                  const active = filter === f.id;
                  return (
                    <Link
                      key={f.id}
                      href={href}
                      className={`rounded-md px-2.5 py-1 text-xs ${
                        active
                          ? "bg-accent text-white"
                          : "border border-line bg-white/80 text-muted"
                      }`}
                    >
                      {f.label}
                    </Link>
                  );
                })}
              </div>
            </div>
            {filter === "card" && cards.length > 1 ? (
              <div className="flex flex-wrap gap-1">
                <Link
                  href={`${listBase}&filter=card`}
                  className={`rounded-md px-2.5 py-1 text-xs ${
                    !params.card
                      ? "bg-ink/80 text-white"
                      : "border border-line bg-white/80 text-muted"
                  }`}
                >
                  カードすべて
                </Link>
                {cards.map((c) => (
                  <Link
                    key={c.id}
                    href={`${listBase}&filter=card&card=${c.id}`}
                    className={`rounded-md px-2.5 py-1 text-xs ${
                      params.card === c.id
                        ? "bg-ink/80 text-white"
                        : "border border-line bg-white/80 text-muted"
                    }`}
                  >
                    {c.name}
                  </Link>
                ))}
              </div>
            ) : null}
            {filter === "loan" && loans.length > 1 ? (
              <div className="flex flex-wrap gap-1">
                <Link
                  href={`${listBase}&filter=loan`}
                  className={`rounded-md px-2.5 py-1 text-xs ${
                    !params.loan
                      ? "bg-ink/80 text-white"
                      : "border border-line bg-white/80 text-muted"
                  }`}
                >
                  ローンすべて
                </Link>
                {loans.map((l) => (
                  <Link
                    key={l.id}
                    href={`${listBase}&filter=loan&loan=${l.id}`}
                    className={`rounded-md px-2.5 py-1 text-xs ${
                      params.loan === l.id
                        ? "bg-ink/80 text-white"
                        : "border border-line bg-white/80 text-muted"
                    }`}
                  >
                    {l.name}
                  </Link>
                ))}
              </div>
            ) : null}
            <LedgerList
              items={ledger}
              showActions
              editBasePath={listBase}
              cardsBasePath={cardsBase}
              loansBasePath={loansBase}
              filter={filter}
              sourceCardId={filter === "card" ? (params.card ?? null) : null}
              sourceLoanId={filter === "loan" ? (params.loan ?? null) : null}
            />
          </section>
          <TransactionsCsvPanel
            monthKey={csvMonth}
            periodQuery={`period=${periodKey}&tab=list`}
          />
        </>
      ) : null}

      {tab === "categories" ? (
        <CategoriesPanel
          categories={categories}
          editingId={params.edit ?? null}
          basePath={categoriesBase}
        />
      ) : null}

      {tab === "recurring" ? (
        <RecurringPanel
          categories={categories}
          accounts={accounts}
          rules={rules}
          editingId={params.edit ?? null}
          basePath={recurringBase}
        />
      ) : null}

      {tab === "cards" ? (
        <div className="grid gap-4">
          <p className="text-sm text-muted">
            予定額で毎月の引落を仮置きし、各月で「実額を確定」できます。確定を削除すると予定に戻ります。
          </p>
          <CardsClient
            cards={cards}
            accounts={accounts}
            schedule={cardSchedule}
            editingCardId={params.editCard ?? null}
            confirmCardId={params.confirmCard ?? null}
            confirmDate={params.confirmDate ?? null}
            editPaymentId={params.editPayment ?? null}
            filterCardId={params.card ?? null}
            basePath={cardsBase}
          />
        </div>
      ) : null}

      {tab === "loans" ? (
        <div className="grid gap-4">
          <p className="text-sm text-muted">
            予定額で毎月展開し、各月で「実額を確定」できます。確定を削除すると予定に戻ります。
          </p>
          <LoansClient
            loans={loans}
            accounts={accounts}
            schedule={loanSchedule}
            editingId={params.edit ?? null}
            confirmLoanId={params.confirmLoan ?? null}
            confirmDate={params.confirmDate ?? null}
            editPaymentId={params.editPayment ?? null}
            filterLoanId={params.loan ?? null}
            basePath={loansBase}
          />
        </div>
      ) : null}
    </div>
  );
}
