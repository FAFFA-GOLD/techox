"use client";

import { useState, useTransition } from "react";
import { saveCashflowPeriod, saveCashflowPlan } from "@/app/actions";
import { EditPopover } from "@/components/edit-popover";
import type {
  CashflowEndingBreakdown,
  CashflowPlanAmounts,
  CashflowRow,
} from "@/lib/cashflow-forecast";
import { formatYen } from "@/lib/money";

export function CashflowClient({
  rows,
  savings,
  base,
  savedBase,
  loadError,
}: {
  rows: CashflowRow[];
  savings: number;
  base: CashflowPlanAmounts;
  savedBase: boolean;
  loadError: string | null;
}) {
  const projected = rows.filter((row) => row.phase !== "past");
  const lowest = projected.reduce(
    (min, row) => Math.min(min, row.ending),
    Number.POSITIVE_INFINITY,
  );
  const firstNegative = projected.find((row) => row.ending < 0) ?? null;
  const now = rows.find((row) => row.phase === "now") ?? null;
  const pair = (withSavings: number) => (
    <>
      {formatYen(withSavings - savings)}
      <span className="ml-1 font-normal text-muted">（{formatYen(withSavings)}）</span>
    </>
  );
  const yearGroups = groupRowsByYear(rows);

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-xl font-bold">キャッシュフロー</h1>
        {now ? (
          <a href="#cashflow-now" className="mt-2 inline-block text-sm text-accent hover:underline">
            いまの期間へ
          </a>
        ) : null}
        <p className="mt-1 text-sm text-muted">
          給料日（月末。土日なら前の平日）から、次の給料日の前日までを1か月として、貯金込みのいまの総資産から先を見ます。起点は2026年10月30日のまま残し、月が進んでもこの表の先頭から消えません。2026年10月29日までは旧履歴です。終わった期間は実績、いまの期間は色を付けています。期末の括弧内は貯金を含んだ額です。
        </p>
      </div>
      {loadError ? <p className="text-sm text-expense">{loadError}</p> : null}
      <section className="grid gap-2 rounded-xl border border-line/80 bg-surface p-4 sm:grid-cols-3">
        <div>
          <p className="text-xs text-muted">いまの期末見込みの最低</p>
          <p className={`text-xl font-bold tabular-nums ${lowest - savings < 0 ? "text-expense" : ""}`}>
            {rows.length === 0 ? "—" : pair(lowest)}
          </p>
        </div>
        <div className="sm:col-span-2">
          <p className="text-xs text-muted">最初にマイナスになる期間</p>
          <p className="text-sm">
            {firstNegative
              ? `${firstNegative.period.label} ${formatYen(firstNegative.ending - savings)}（${formatYen(firstNegative.ending)}）`
              : "この範囲ではマイナスになりません"}
          </p>
        </div>
      </section>
      <BasePlanForm base={base} saved={savedBase} />
      {yearGroups.length > 0 ? (
        <section className="grid gap-2 sm:grid-cols-3">
          {yearGroups.map((group) => {
            const projectedInYear = group.rows.filter((row) => row.phase !== "past");
            const closing = projectedInYear[projectedInYear.length - 1] ?? null;
            const lowestInYear = projectedInYear.reduce(
              (min, row) => Math.min(min, row.ending),
              Number.POSITIVE_INFINITY,
            );
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
                <p
                  className={`text-sm font-semibold tabular-nums ${
                    closing && closing.ending - savings < 0 ? "text-expense" : ""
                  }`}
                >
                  {closing ? pair(closing.ending) : "実績のみ"}
                </p>
                <p className="mt-1 text-[11px] text-muted">
                  {closing
                    ? `この年の最低 ${formatYen(lowestInYear - savings)}（${formatYen(lowestInYear)}）`
                    : "この年は終わった期間だけです"}
                </p>
              </a>
            );
          })}
        </section>
      ) : null}
      <div className="overflow-x-auto rounded-xl border border-line/80">
        <table className="min-w-[52rem] w-full text-left text-sm">
          <thead className="bg-white/80 text-xs text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">期間</th>
              <th className="px-3 py-2 font-medium">期首</th>
              <th className="px-3 py-2 font-medium">収入</th>
              <th className="px-3 py-2 font-medium">取引の支出</th>
              <th className="px-3 py-2 font-medium">デイリー</th>
              <th className="px-3 py-2 font-medium">交通費</th>
              <th className="px-3 py-2 font-medium">調整</th>
              <th className="px-3 py-2 font-medium">期末</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {yearGroups.flatMap((group) => [
              <tr key={`year-${group.year}`} id={`cashflow-year-${group.year}`} className="bg-[#eef5f3]">
                <td colSpan={9} className="px-3 py-2 text-sm font-bold text-accent-deep">
                  {group.year}年
                  <span className="ml-2 text-xs font-normal text-muted">
                    {group.rows.length}期
                  </span>
                </td>
              </tr>,
              ...group.rows.map((row) => (
              <tr
                key={row.period.start}
                id={row.phase === "now" ? "cashflow-now" : undefined}
                className={
                  row.phase === "now"
                    ? "bg-[#eef5f3] outline outline-2 outline-accent"
                    : row.phase === "past"
                      ? "bg-white/40 text-muted"
                      : row.ending < 0
                        ? "bg-red-50/80"
                        : "bg-white/70"
                }
              >
                <td className="px-3 py-2 whitespace-nowrap">
                  {row.phase === "now" ? (
                    <span className="mr-2 rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-white">
                      いま
                    </span>
                  ) : row.phase === "past" ? (
                    <span className="mr-2 rounded-full border border-line px-2 py-0.5 text-[10px]">
                      済
                    </span>
                  ) : null}
                  {row.period.label}
                </td>
                <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                  {row.phase === "past" ? "実績" : pair(row.opening)}
                </td>
                <td className="px-3 py-2 tabular-nums text-income">{formatYen(row.income)}</td>
                <td className="px-3 py-2 tabular-nums text-expense">
                  {formatYen(row.scheduledExpense)}
                </td>
                <td className="px-3 py-2 tabular-nums">{formatYen(row.daily)}</td>
                <td className="px-3 py-2 tabular-nums">{formatYen(row.transport)}</td>
                <td className="px-3 py-2 tabular-nums">{formatYen(row.adjustment)}</td>
                <td className="px-3 py-2">
                  {row.phase === "past" || !row.breakdown ? (
                    "実績"
                  ) : (
                    <EditPopover
                      wide
                      title={`${row.period.label} の期末`}
                      buttonClassName={`font-semibold tabular-nums whitespace-nowrap underline decoration-dotted underline-offset-4 ${
                        row.ending - savings < 0 ? "text-expense" : ""
                      }`}
                      buttonLabel={pair(row.ending)}
                    >
                      <EndingBreakdown breakdown={row.breakdown} savings={savings} />
                    </EditPopover>
                  )}
                </td>
                <td className="px-3 py-2">
                  <EditPopover buttonLabel={row.custom ? "この期を編集済" : "この期だけ"} title="この期の予算">
                    <PeriodForm
                      periodStart={row.period.start}
                      label={row.period.label}
                      daily={row.planDaily}
                      transport={row.planTransport}
                      adjustment={row.planAdjustment}
                      custom={row.custom}
                    />
                  </EditPopover>
                </td>
              </tr>
              )),
            ])}
          </tbody>
        </table>
      </div>
    </div>
  );
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

function BasePlanForm({
  base,
  saved,
}: {
  base: CashflowPlanAmounts;
  saved: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="grid gap-3 rounded-xl border border-line/80 bg-surface p-4"
      action={(fd) => {
        startTransition(async () => {
          const res = await saveCashflowPlan(fd);
          setError(res && "error" in res ? res.error ?? null : null);
        });
      }}
    >
      <div>
        <h2 className="text-sm font-bold">基本の毎月見込み</h2>
        <p className="mt-1 text-xs text-muted">
          先の期間は同じ金額です。各期の「この期だけ」で、その期間だけ変えられます。
          {saved ? "" : " 初期値はいまのデイリー予算と交通費予算です。"}
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <MoneyField name="daily_budget" label="デイリー予算額" defaultValue={base.daily} />
        <MoneyField name="transport_budget" label="交通費予算額" defaultValue={base.transport} />
        <MoneyField name="adjustment" label="調整金額" defaultValue={base.adjustment} />
      </div>
      {error ? <p className="text-sm text-expense">{error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="w-fit rounded-md bg-accent px-3 py-2 text-sm text-white disabled:opacity-60"
      >
        {pending ? "保存しています…" : "基本を保存"}
      </button>
    </form>
  );
}

function PeriodForm({
  periodStart,
  label,
  daily,
  transport,
  adjustment,
  custom,
}: {
  periodStart: string;
  label: string;
  daily: number;
  transport: number;
  adjustment: number;
  custom: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="grid gap-2"
      action={(fd) => {
        startTransition(async () => {
          const res = await saveCashflowPeriod(fd);
          setError(res && "error" in res ? res.error ?? null : null);
        });
      }}
    >
      <p className="text-xs text-muted">{label}</p>
      <input type="hidden" name="period_start" value={periodStart} />
      <MoneyField name="daily_budget" label="デイリー予算額" defaultValue={daily} />
      <MoneyField name="transport_budget" label="交通費予算額" defaultValue={transport} />
      <MoneyField name="adjustment" label="調整金額" defaultValue={adjustment} />
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
          基本の金額に戻す
        </button>
      ) : null}
    </form>
  );
}

function EndingBreakdown({
  breakdown,
  savings,
}: {
  breakdown: CashflowEndingBreakdown;
  savings: number;
}) {
  const departments = breakdown.accounts.reduce((sum, line) => sum + line.ending, 0);
  return (
    <div className="grid gap-3 text-sm">
      <p className="text-xs text-muted">
        今日の各部門に、この期末までに入る予定の入出金を足しています。デイリー・交通費・調整は部門が決まっていないので、あとからまとめて引いています。
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="text-muted">
            <tr>
              <th className="py-1 pr-3 font-medium">部門</th>
              <th className="py-1 pr-3 font-medium">今日</th>
              <th className="py-1 pr-3 font-medium">この先</th>
              <th className="py-1 font-medium">期末</th>
            </tr>
          </thead>
          <tbody>
            {breakdown.accounts.map((line) => (
              <tr key={line.name} className="border-t border-line">
                <td className="py-1 pr-3">
                  {line.name}
                  {line.savings ? <span className="ml-1 text-muted">貯金</span> : null}
                </td>
                <td className="py-1 pr-3 tabular-nums">{formatYen(line.now)}</td>
                <td className="py-1 pr-3 tabular-nums">
                  {line.change === 0 ? "—" : formatYen(line.change)}
                </td>
                <td className="py-1 font-medium tabular-nums">{formatYen(line.ending)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="grid gap-1 text-xs">
        <div className="flex justify-between gap-3">
          <dt>部門の合計</dt>
          <dd className="tabular-nums">{formatYen(departments)}</dd>
        </div>
        {breakdown.unassigned !== 0 ? (
          <div className="flex justify-between gap-3">
            <dt>部門が未設定の入出金</dt>
            <dd className="tabular-nums">{formatYen(breakdown.unassigned)}</dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-3">
          <dt>デイリー（いまからこの期末まで）</dt>
          <dd className="tabular-nums text-expense">-{formatYen(breakdown.daily)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>交通費（いまからこの期末まで）</dt>
          <dd className="tabular-nums text-expense">-{formatYen(breakdown.transport)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>調整（いまからこの期末まで）</dt>
          <dd className={`tabular-nums ${breakdown.adjustment > 0 ? "text-expense" : ""}`}>
            {breakdown.adjustment > 0 ? "-" : breakdown.adjustment < 0 ? "+" : ""}
            {formatYen(Math.abs(breakdown.adjustment))}
          </dd>
        </div>
        <div className="flex justify-between gap-3 border-t border-line pt-1 text-sm font-semibold">
          <dt>期末（括弧内）</dt>
          <dd className="tabular-nums">{formatYen(breakdown.total)}</dd>
        </div>
        <div className="flex justify-between gap-3 font-semibold">
          <dt>今日の貯金 {formatYen(savings)} を除いた額</dt>
          <dd className="tabular-nums">{formatYen(breakdown.total - savings)}</dd>
        </div>
      </dl>
    </div>
  );
}

function MoneyField({
  name,
  label,
  defaultValue,
}: {
  name: string;
  label: string;
  defaultValue: number;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-muted">{label}</span>
      <input
        name={name}
        type="number"
        required
        defaultValue={defaultValue}
        className="rounded-md border border-line bg-white px-3 py-2"
      />
    </label>
  );
}
