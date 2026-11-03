"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveCashflowBankPeriod, saveCashflowBanks } from "@/app/actions";
import { EditPopover, useClosePopover } from "@/components/edit-popover";
import {
  CASHFLOW_AICHI_BANK,
  CASHFLOW_DOCOMO_BANK,
  type CashflowAuditLine,
  type CashflowBankColumn,
  type CashflowRow,
} from "@/lib/cashflow-forecast";
import { formatYen } from "@/lib/money";

export function CashflowClient({
  rows,
  openingPeriodStart,
  aichiOpening,
  docomoOpening,
  salaryRetain,
  savedBase,
  loadError,
}: {
  rows: CashflowRow[];
  openingPeriodStart: string;
  aichiOpening: number;
  docomoOpening: number;
  salaryRetain: number;
  savedBase: boolean;
  loadError: string | null;
}) {
  const tracked = rows.filter((row) => row.tracked);
  const firstNegative = tracked.find((row) => row.aichi.ending < 0 || row.docomo.ending < 0) ?? null;
  const now = tracked.find((row) => row.phase === "now") ?? null;
  const yearGroups = groupRowsByYear(rows);

  return (
    <div className="grid min-w-0 gap-4">
      <div>
        <h1 className="text-xl font-bold">キャッシュフロー</h1>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {now ? (
            <a href="#cashflow-now" className="text-accent hover:underline">
              いまの期間へ
            </a>
          ) : null}
          <a href="/api/export/cashflow" className="text-accent hover:underline">
            確認用エクセル
          </a>
        </div>
        <p className="mt-1 text-sm text-muted">
          あいち銀行とドコモ銀行だけを追います。開始残高は給料が入る前の残高で、その残高から残す給料は引きません。給料のうち残す額をあいち銀行へ、残りをドコモ銀行へ入れます。広告収入はあいち銀行です。取引登録の当月分は、一覧に出ている銀行から引きます。その月の行に口座が無くても登録の銀行を使い、用途が日々の支出でも取引登録なら引きます。カレンダーに入れた日々の支出と交通費は入れません。
        </p>
      </div>
      {loadError ? <p className="text-sm text-expense">{loadError}</p> : null}
      <section className="grid gap-2 rounded-xl border border-line/80 bg-surface p-4 sm:grid-cols-3">
        <BankNow label={CASHFLOW_AICHI_BANK} amount={now?.aichi.ending ?? null} />
        <BankNow label={CASHFLOW_DOCOMO_BANK} amount={now?.docomo.ending ?? null} />
        <div>
          <p className="text-xs text-muted">最初にマイナスになる期間</p>
          <p className="mt-1 text-sm">
            {firstNegative
              ? `${monthDayLabel(firstNegative.period.start, firstNegative.period.end)} ${negativeBank(firstNegative)}`
              : "この範囲ではマイナスになりません"}
          </p>
        </div>
      </section>
      <OpeningForm
        openingPeriodStart={openingPeriodStart}
        aichiOpening={aichiOpening}
        docomoOpening={docomoOpening}
        salaryRetain={salaryRetain}
        saved={savedBase}
      />
      {yearGroups.length > 0 ? (
        <section className="grid gap-2 sm:grid-cols-3">
          {yearGroups.map((group) => {
            const trackedInYear = group.rows.filter((row) => row.tracked);
            const closing = trackedInYear[trackedInYear.length - 1] ?? null;
            const containsNow = group.rows.some((row) => row.phase === "now");
            return (
              <a
                key={group.year}
                href={`#cashflow-year-${group.year}`}
                className={`rounded-xl border p-3 hover:border-accent ${
                  containsNow ? "border-accent bg-[#eef5f3]" : "border-line/80 bg-surface"
                }`}
              >
                <p className="text-sm font-bold">
                  {group.year}年
                  {containsNow ? (
                    <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-white">
                      いま
                    </span>
                  ) : null}
                </p>
                <p className="mt-1 text-[11px] text-muted">この年の最後の期末</p>
                <p className="text-sm font-semibold tabular-nums">
                  {closing
                    ? `${CASHFLOW_AICHI_BANK} ${formatYen(closing.aichi.ending)}`
                    : "対象の期間はありません"}
                </p>
                <p className="text-sm font-semibold tabular-nums">
                  {closing ? `${CASHFLOW_DOCOMO_BANK} ${formatYen(closing.docomo.ending)}` : ""}
                </p>
              </a>
            );
          })}
        </section>
      ) : null}
      <div className="min-w-0 overflow-x-auto rounded-xl border border-line/80">
        <table className="w-full min-w-[52rem] text-left text-sm">
          <thead className="bg-white/80 text-xs text-muted">
            <tr>
              <th className="px-2 py-2 font-medium">期間</th>
              <th className="px-2 py-2 font-medium">あいち期首</th>
              <th className="px-2 py-2 font-medium">あいち期末</th>
              <th className="px-2 py-2 font-medium">ドコモ期首</th>
              <th className="px-2 py-2 font-medium">ドコモ期末</th>
              <th className="sticky right-0 z-10 bg-white px-2 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {yearGroups.flatMap((group) => [
              <tr key={`year-${group.year}`} id={`cashflow-year-${group.year}`} className="bg-[#eef5f3]">
                <td colSpan={6} className="px-2 py-2 text-sm font-bold text-accent-deep">
                  {group.year}年
                  <span className="ml-2 text-xs font-normal text-muted">{group.rows.length}期</span>
                </td>
              </tr>,
              ...group.rows.map((row) => {
                const negative = row.tracked && (row.aichi.ending < 0 || row.docomo.ending < 0);
                return (
                  <tr
                    key={row.period.start}
                    id={row.phase === "now" ? "cashflow-now" : undefined}
                    className={
                      row.phase === "now"
                        ? "bg-[#eef5f3] ring-2 ring-inset ring-accent"
                        : row.phase === "past"
                          ? "bg-white/40 text-muted"
                          : negative
                            ? "bg-red-50/80"
                            : "bg-white/70"
                    }
                  >
                    <td className="px-2 py-2 whitespace-nowrap">
                      {row.phase === "now" ? (
                        <span className="mr-2 rounded-full bg-accent px-2 py-0.5 text-[10px] text-white">いま</span>
                      ) : null}
                      {monthDayLabel(row.period.start, row.period.end)}
                    </td>
                    <td className="px-2 py-2 tabular-nums whitespace-nowrap">
                      {row.tracked ? formatYen(row.aichi.opening) : "—"}
                    </td>
                    <td className={`px-2 py-2 font-semibold tabular-nums whitespace-nowrap ${row.tracked && row.aichi.ending < 0 ? "text-expense" : ""}`}>
                      {row.tracked ? formatYen(row.aichi.ending) : "—"}
                    </td>
                    <td className="px-2 py-2 tabular-nums whitespace-nowrap">
                      {row.tracked ? formatYen(row.docomo.opening) : "—"}
                    </td>
                    <td className={`px-2 py-2 font-semibold tabular-nums whitespace-nowrap ${row.tracked && row.docomo.ending < 0 ? "text-expense" : ""}`}>
                      {row.tracked ? formatYen(row.docomo.ending) : "—"}
                    </td>
                    <td
                      className={`sticky right-0 z-10 px-2 py-2 whitespace-nowrap ${
                        row.phase === "now"
                          ? "bg-[#eef5f3]"
                          : negative
                            ? "bg-red-50"
                            : "bg-white"
                      }`}
                    >
                      {row.tracked ? (
                        <div className="flex items-center gap-1">
                          <EditPopover title={`${monthDayLabel(row.period.start, row.period.end)} の内訳`} buttonLabel="内訳">
                            <PeriodBreakdown row={row} />
                          </EditPopover>
                          <EditPopover buttonLabel="編集" title="この期の調整">
                            <PeriodForm
                              periodStart={row.period.start}
                              label={row.period.label}
                              salaryRetain={row.salaryRetain}
                              aichiAdjustment={row.aichi.adjustment}
                              docomoAdjustment={row.docomo.adjustment}
                              custom={row.custom}
                            />
                          </EditPopover>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              }),
            ])}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BankNow({ label, amount }: { label: string; amount: number | null }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}の期末見込み</p>
      <p className={`text-xl font-bold tabular-nums ${amount != null && amount < 0 ? "text-expense" : ""}`}>
        {amount == null ? "—" : formatYen(amount)}
      </p>
    </div>
  );
}

function negativeBank(row: CashflowRow): string {
  const parts = [
    row.aichi.ending < 0 ? `${CASHFLOW_AICHI_BANK} ${formatYen(row.aichi.ending)}` : "",
    row.docomo.ending < 0 ? `${CASHFLOW_DOCOMO_BANK} ${formatYen(row.docomo.ending)}` : "",
  ].filter(Boolean);
  return parts.join(" / ");
}

function OpeningForm({
  openingPeriodStart,
  aichiOpening,
  docomoOpening,
  salaryRetain,
  saved,
}: {
  openingPeriodStart: string;
  aichiOpening: number;
  docomoOpening: number;
  salaryRetain: number;
  saved: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <form
      className="grid gap-3 rounded-xl border border-line/80 bg-surface p-4"
      action={(fd) => {
        startTransition(async () => {
          const res = await saveCashflowBanks(fd);
          setError(res && "error" in res ? res.error ?? null : null);
          if (!res || !("error" in res) || !res.error) router.refresh();
        });
      }}
    >
      <div>
        <h2 className="text-sm font-bold">開始残高</h2>
        <p className="mt-1 text-xs text-muted">
          {monthDayLabel(openingPeriodStart, openingPeriodStart)}の、給料が入る前の残高です。この残高から、あいち銀行に残す給料は引きません。残す額は毎月この数字を使い、各期の編集でその月だけ変えられます。
          {saved ? "" : " まだ保存していないので、表示中の金額は初期値です。"}
        </p>
      </div>
      <input type="hidden" name="opening_period_start" value={openingPeriodStart} />
      <div className="grid gap-2 sm:grid-cols-3">
        <MoneyField name="aichi_opening" label="あいち銀行の開始" defaultValue={aichiOpening} />
        <MoneyField name="docomo_opening" label="ドコモ銀行の開始" defaultValue={docomoOpening} />
        <MoneyField name="salary_retain" label="給料のうちあいち銀行に残す額" defaultValue={salaryRetain} min={0} />
      </div>
      {error ? <p className="text-sm text-expense">{error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="w-fit rounded-md bg-accent px-3 py-2 text-sm text-white disabled:opacity-60"
      >
        {pending ? "保存しています…" : "開始残高を保存"}
      </button>
    </form>
  );
}

function PeriodForm({
  periodStart,
  label,
  salaryRetain,
  aichiAdjustment,
  docomoAdjustment,
  custom,
}: {
  periodStart: string;
  label: string;
  salaryRetain: number;
  aichiAdjustment: number;
  docomoAdjustment: number;
  custom: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const closePopover = useClosePopover();
  return (
    <form
      className="grid gap-2"
      action={async (fd) => {
        setPending(true);
        const res = await saveCashflowBankPeriod(fd);
        const message = res && "error" in res ? res.error ?? null : null;
        setError(message);
        if (message) {
          setPending(false);
          return;
        }
        closePopover?.();
        await new Promise((resolve) => setTimeout(resolve, 0));
        router.refresh();
      }}
    >
      <p className="text-xs text-muted">{label}</p>
      <p className="text-xs text-muted">
        あいち銀行に残す額は、この期の給料から回す分です。調整は期末へ足します。マイナスにすると期末が減ります。翌月の期首は、調整したあとの期末です。
      </p>
      <input type="hidden" name="period_start" value={periodStart} />
      <MoneyField name="salary_retain" label="あいち銀行に残す給料" defaultValue={salaryRetain} min={0} />
      <MoneyField name="aichi_adjustment" label="あいち銀行の調整" defaultValue={aichiAdjustment} />
      <MoneyField name="docomo_adjustment" label="ドコモ銀行の調整" defaultValue={docomoAdjustment} />
      {error ? <p className="text-sm text-expense">{error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-accent px-3 py-2 text-sm text-white disabled:opacity-60"
      >
        {pending ? "保存しています…" : "この期だけ保存"}
      </button>
      {custom ? (
        <button
          type="submit"
          name="reset"
          value="1"
          disabled={pending}
          className="text-left text-xs text-muted hover:text-expense"
        >
          基本の残す額に戻し、調整を消す
        </button>
      ) : null}
    </form>
  );
}

function PeriodBreakdown({ row }: { row: CashflowRow }) {
  return (
    <div className="grid gap-4 text-sm">
      <BankBreakdown
        title={CASHFLOW_AICHI_BANK}
        bank={row.aichi}
        adIncome={row.adIncome}
        items={row.items.filter((item) => item.accountName === CASHFLOW_AICHI_BANK)}
      />
      <BankBreakdown
        title={CASHFLOW_DOCOMO_BANK}
        bank={row.docomo}
        adIncome={0}
        items={row.items.filter((item) => item.accountName === CASHFLOW_DOCOMO_BANK)}
      />
      {row.outside.length > 0 ? (
        <div>
          <p className="text-xs font-medium">この表に入らない取引</p>
          <ul className="mt-1 grid text-xs">
            {row.outside.map((item) => (
              <li key={`${item.accountName}-${item.item}-${item.amount}`} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-t border-line py-1.5">
                <span className="min-w-0 truncate">
                  {item.item}
                  <span className="ml-1 text-muted">{item.accountName}</span>
                </span>
                <span className="tabular-nums">{formatYen(item.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function BankBreakdown({
  title,
  bank,
  adIncome,
  items,
}: {
  title: string;
  bank: CashflowBankColumn;
  adIncome: number;
  items: CashflowAuditLine[];
}) {
  return (
    <div>
      <p className="font-medium">{title}</p>
      <dl className="mt-1 grid gap-1 text-xs">
        <BreakdownLine label="期首" amount={formatYen(bank.opening)} />
        <BreakdownLine label="給料" amount={formatYen(bank.salary)} />
        {adIncome !== 0 ? <BreakdownLine label="広告収入" amount={formatYen(adIncome)} /> : null}
        {bank.otherIncome !== 0 ? <BreakdownLine label="その他収入" amount={formatYen(bank.otherIncome)} /> : null}
        <BreakdownLine label="支出" amount={formatYen(-bank.expense)} expense />
        {bank.adjustment !== 0 ? <BreakdownLine label="調整" amount={formatYen(bank.adjustment)} /> : null}
        <BreakdownLine label="期末" amount={formatYen(bank.ending)} strong rule />
      </dl>
      {items.length > 0 ? (
        <ul className="mt-2 grid text-xs">
          {items.map((item) => (
            <li key={`${item.date}-${item.kind}-${item.item}-${item.amount}`} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-t border-line py-1.5">
              <span className="min-w-0 truncate">
                {item.item}
                <span className="ml-1 text-muted">{item.kind}</span>
              </span>
              <span className="tabular-nums">{formatYen(item.amount)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function BreakdownLine({
  label,
  amount,
  expense = false,
  strong = false,
  rule = false,
}: {
  label: string;
  amount: string;
  expense?: boolean;
  strong?: boolean;
  rule?: boolean;
}) {
  return (
    <div className={`grid grid-cols-[minmax(0,1fr)_auto] gap-3 ${rule ? "border-t border-line pt-1" : ""} ${strong ? "text-sm font-semibold" : ""}`}>
      <dt>{label}</dt>
      <dd className={`tabular-nums ${expense ? "text-expense" : ""}`}>{amount}</dd>
    </div>
  );
}

function MoneyField({
  name,
  label,
  defaultValue,
  min,
}: {
  name: string;
  label: string;
  defaultValue: number;
  min?: number;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-muted">{label}</span>
      <input
        name={name}
        type="number"
        required
        min={min}
        defaultValue={defaultValue}
        className="rounded-md border border-line bg-white px-3 py-2"
      />
    </label>
  );
}

function monthDayLabel(start: string, end: string): string {
  const fmt = (iso: string) => {
    const [, month, day] = iso.split("-");
    return `${Number(month)}月${Number(day)}日`;
  };
  if (start === end) return fmt(start);
  return `${fmt(start)}〜${fmt(end)}`;
}

function groupRowsByYear(rows: CashflowRow[]): { year: string; rows: CashflowRow[] }[] {
  const groups: { year: string; rows: CashflowRow[] }[] = [];
  for (const row of rows) {
    const year = row.period.start.slice(0, 4);
    const current = groups[groups.length - 1];
    if (!current || current.year !== year) groups.push({ year, rows: [row] });
    else current.rows.push(row);
  }
  return groups;
}
