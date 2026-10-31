"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { upsertBalanceSnapshot } from "@/app/actions";
import { todayKeyInTimeZone } from "@/lib/dates";
import { EditPopover } from "@/components/edit-popover";
import { formatYen } from "@/lib/money";
import {
  forecastAccountDays,
  type AccountBalanceView,
  type AccountForecastDay,
} from "@/lib/account-display";
import {
  DEFAULT_SAVINGS_ACCOUNTS,
  isSavingsAccountName,
  type DailySpendEntry,
} from "@/lib/types";

const miniButton =
  "rounded border border-line bg-white px-1.5 py-0.5 text-[10px] leading-none text-muted hover:text-ink";

export function AccountBalanceStrip({
  balances,
  monthEntries,
  laterEntries,
  today,
  monthEnd,
  laterMonthEnd,
}: {
  balances: AccountBalanceView[];
  monthEntries: DailySpendEntry[];
  laterEntries: DailySpendEntry[];
  today: string;
  monthEnd: string;
  laterMonthEnd: string | null;
}) {
  const banks = balances.filter((a) => a.kind === "bank");
  const emoney = balances.filter(
    (a) => a.kind === "emoney" && !isSavingsAccountName(a.name),
  );
  const savings = DEFAULT_SAVINGS_ACCOUNTS.flatMap((item) => {
    const account = balances.find((row) => row.name === item.name);
    return account ? [account] : [];
  });

  const forecastFor = (account: AccountBalanceView) =>
    buildDepartmentForecast(account, monthEntries, laterEntries, today, monthEnd, laterMonthEnd);

  return (
    <section className="grid gap-3">
      <BalanceRow title="銀行" accounts={banks} forecastFor={forecastFor} today={today} />
      <BalanceRow title="電子マネー" accounts={emoney} forecastFor={forecastFor} today={today} />
      <BalanceRow title="貯金" accounts={savings} forecastFor={forecastFor} today={today} />
    </section>
  );
}

export function DepartmentShortfallWarnings({
  balances,
  monthEntries,
  laterEntries,
  today,
  monthEnd,
  laterMonthEnd,
}: {
  balances: AccountBalanceView[];
  monthEntries: DailySpendEntry[];
  laterEntries: DailySpendEntry[];
  today: string;
  monthEnd: string;
  laterMonthEnd: string | null;
}) {
  const warnings = balances.flatMap((account) => {
    if (account.balance == null) return [];
    const days = buildDepartmentForecast(
      account,
      monthEntries,
      laterEntries,
      today,
      monthEnd,
      laterMonthEnd,
    );
    const hit = days.find((day) => day.balanceAfter < 0);
    return hit ? [{ name: account.name, date: hit.date, balance: hit.balanceAfter }] : [];
  });
  if (warnings.length === 0) return null;
  return (
    <div className="grid gap-1 rounded-xl border border-expense/40 bg-red-50 px-4 py-3 text-sm text-expense">
      {warnings.map((warning) => (
        <p key={`${warning.name}-${warning.date}`}>
          {slashDate(warning.date)}に{warning.name}が{formatYen(warning.balance)}になる予定です。
        </p>
      ))}
    </div>
  );
}

function buildDepartmentForecast(
  account: AccountBalanceView,
  monthEntries: DailySpendEntry[],
  laterEntries: DailySpendEntry[],
  today: string,
  monthEnd: string,
  laterMonthEnd: string | null,
): AccountForecastDay[] {
  if (account.balance == null) return [];
  const thisMonth = forecastAccountDays(
    account.id,
    account.balance,
    monthEntries,
    today,
    monthEnd,
  );
  if (!laterMonthEnd || laterEntries.length === 0) return thisMonth;
  const opening = thisMonth.at(-1)?.balanceAfter ?? account.balance;
  const laterStart = laterEntries
    .map((entry) => String(entry.date).slice(0, 10))
    .sort()[0];
  const after = laterStart ? addDays(laterStart, -1) : today;
  return [
    ...thisMonth,
    ...forecastAccountDays(account.id, opening, laterEntries, after, laterMonthEnd),
  ];
}

function BalanceRow({
  title,
  accounts,
  forecastFor,
  today,
}: {
  title: string;
  accounts: AccountBalanceView[];
  forecastFor: (account: AccountBalanceView) => AccountForecastDay[];
  today: string;
}) {
  if (accounts.length === 0) return null;
  return (
    <div className="grid gap-2">
      <p className="text-xs font-medium text-muted">{title}</p>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
        {accounts.map((account) => (
          <article
            key={account.id}
            className="flex items-start justify-between gap-1.5 rounded-xl border border-line/80 bg-surface px-2.5 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-xs text-muted">{account.name}</p>
              <p className="mt-0.5 text-base font-bold tabular-nums sm:text-lg">
                {account.balance == null ? "未登録" : formatYen(account.balance)}
              </p>
              <p className="mt-0.5 text-[10px] leading-snug text-muted">
                {account.asOf ? `${account.asOf} 以降〜今日` : "残高を登録"}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <EditPopover
                buttonLabel="変更"
                title={`${account.name}の残高`}
                buttonClassName={miniButton}
              >
                <BalanceForm accountId={account.id} />
              </EditPopover>
              <EditPopover
                buttonLabel="明細"
                title={`${account.name}の明細`}
                wide
                buttonClassName={miniButton}
              >
                <AccountLedger
                  account={account}
                  days={forecastFor(account)}
                  today={today}
                />
              </EditPopover>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function AccountLedger({
  account,
  days,
  today,
}: {
  account: AccountBalanceView;
  days: AccountForecastDay[];
  today: string;
}) {
  return (
    <div className="grid gap-3 text-sm">
      <p>
        いまの残高{" "}
        <span className="font-semibold tabular-nums">
          {account.balance == null ? "未登録" : formatYen(account.balance)}
        </span>
      </p>
      <p className="text-xs text-muted">
        {slashDate(today)}よりあとの入出金です。この部門の中だけで足し引きするので、他の部門へ移すとここは増え、総資産は変わりません。
      </p>
      {account.balance == null ? (
        <p className="text-xs text-muted">残高を登録すると、予定日ごとの残高が出ます。</p>
      ) : days.length === 0 ? (
        <p className="text-xs text-muted">この先の予定はありません。</p>
      ) : (
        <ul className="grid gap-2">
          {days.map((day) => (
            <li key={day.date} className="rounded-lg border border-line/80 px-3 py-2">
              <p className="text-xs font-medium">{slashDate(day.date)}</p>
              <ul className="mt-1 grid gap-0.5">
                {day.lines.map((line, index) => (
                  <li key={`${day.date}-${index}`} className="flex justify-between gap-3">
                    <span className="min-w-0 truncate">{line.label}</span>
                    <span
                      className={`shrink-0 tabular-nums ${
                        line.kind === "income" ? "text-income" : "text-expense"
                      }`}
                    >
                      {line.kind === "income" ? "+" : "−"}
                      {formatYen(line.amount)}
                    </span>
                  </li>
                ))}
              </ul>
              <p
                className={`mt-1 text-right text-xs font-semibold tabular-nums ${
                  day.balanceAfter < 0 ? "text-expense" : ""
                }`}
              >
                この日のあと {formatYen(day.balanceAfter)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function slashDate(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  const nowYear = Number(todayKeyInTimeZone().slice(0, 4));
  const body = `${month}月${day}日`;
  return year === nowYear ? body : `${year}年${body}`;
}

function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const cursor = new Date(Date.UTC(year, month - 1, day + days));
  return `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}-${String(cursor.getUTCDate()).padStart(2, "0")}`;
}

function BalanceForm({ accountId }: { accountId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const today = todayKeyInTimeZone();

  return (
    <form
      className="grid gap-2"
      action={(fd) => {
        startTransition(async () => {
          const res = await upsertBalanceSnapshot(fd);
          setError(res?.error ?? null);
          setOk(!res?.error);
          if (!res?.error) router.refresh();
        });
      }}
    >
      <input type="hidden" name="asset_account_id" value={accountId} />
      <label className="grid gap-1 text-sm">
        <span className="text-muted">この日の残高</span>
        <input
          name="as_of_date"
          type="date"
          required
          defaultValue={today}
          className="rounded-md border border-line bg-white px-3 py-2"
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-muted">金額（円）</span>
        <input
          name="balance"
          type="number"
          required
          className="rounded-md border border-line bg-white px-3 py-2"
          placeholder="0"
        />
      </label>
      <p className="text-[11px] text-muted">
        入力した金額が、その日の実残高です。翌日以降に記録した入出金だけを足し引きします。今日より先の予定はここには入れません。もう一度手入力すると、その金額が新しい正になります。
      </p>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-accent px-3 py-2 text-sm text-white disabled:opacity-60"
      >
        {pending ? "保存中…" : "保存"}
      </button>
      {ok && !error ? <p className="text-sm text-income">保存しました</p> : null}
      {error ? <p className="text-sm text-expense">{error}</p> : null}
    </form>
  );
}
