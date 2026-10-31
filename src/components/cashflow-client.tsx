"use client";

import { useState, useTransition } from "react";
import { saveCashflowPeriod, saveCashflowPlan } from "@/app/actions";
import { EditPopover } from "@/components/edit-popover";
import type { CashflowPlanAmounts, CashflowRow } from "@/lib/cashflow-forecast";
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
  const lowest = rows.reduce(
    (min, row) => Math.min(min, row.ending),
    Number.POSITIVE_INFINITY,
  );
  const firstNegative = rows.find((row) => row.ending < 0) ?? null;
  const pair = (withSavings: number) => (
    <>
      {formatYen(withSavings - savings)}
      <span className="ml-1 font-normal text-muted">（{formatYen(withSavings)}）</span>
    </>
  );

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-xl font-bold">キャッシュフロー</h1>
        <p className="mt-1 text-sm text-muted">
          給料日（月末。土日なら前の平日）から、次の給料日の前日までを1か月として、貯金込みのいまの総資産から先を見ます。2026年10月29日までは旧履歴として外し、10月30日から計算します。期末の括弧内は貯金を含んだ額です。今の期間のデイリーと交通費は、予算から今日までに使った分を引いた残りです。
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
            {rows.map((row) => (
              <tr
                key={row.period.start}
                className={row.ending < 0 ? "bg-red-50/80" : "bg-white/70"}
              >
                <td className="px-3 py-2 whitespace-nowrap">{row.period.label}</td>
                <td className="px-3 py-2 tabular-nums whitespace-nowrap">{pair(row.opening)}</td>
                <td className="px-3 py-2 tabular-nums text-income">{formatYen(row.income)}</td>
                <td className="px-3 py-2 tabular-nums text-expense">
                  {formatYen(row.scheduledExpense)}
                </td>
                <td className="px-3 py-2 tabular-nums">{formatYen(row.daily)}</td>
                <td className="px-3 py-2 tabular-nums">{formatYen(row.transport)}</td>
                <td className="px-3 py-2 tabular-nums">{formatYen(row.adjustment)}</td>
                <td
                  className={`px-3 py-2 font-semibold tabular-nums whitespace-nowrap ${
                    row.ending - savings < 0 ? "text-expense" : ""
                  }`}
                >
                  {pair(row.ending)}
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
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
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
