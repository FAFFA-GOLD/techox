"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { upsertBalanceSnapshot } from "@/app/actions";
import { todayKeyInTimeZone } from "@/lib/dates";
import { EditPopover } from "@/components/edit-popover";
import { formatYen } from "@/lib/money";
import type { AccountBalanceView } from "@/lib/account-display";
import { assetAccountKindLabel } from "@/lib/types";

export function AccountBalanceStrip({
  balances,
}: {
  balances: AccountBalanceView[];
}) {
  const banks = balances.filter((a) => a.kind === "bank");
  const emoney = balances.filter((a) => a.kind !== "bank");

  return (
    <section className="grid gap-3">
      <BalanceRow title="銀行" accounts={banks} />
      <BalanceRow title="電子マネー" accounts={emoney} />
    </section>
  );
}

function BalanceRow({
  title,
  accounts,
}: {
  title: string;
  accounts: AccountBalanceView[];
}) {
  if (accounts.length === 0) return null;
  return (
    <div className="grid gap-2">
      <p className="text-xs font-medium text-muted">{title}</p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {accounts.map((account) => (
          <article
            key={account.id}
            className="flex items-start justify-between gap-2 rounded-xl border border-line/80 bg-surface px-3 py-3"
          >
            <div className="min-w-0">
              <p className="truncate text-xs text-muted">
                {account.name}
                <span className="ml-1">{assetAccountKindLabel(account.kind)}</span>
              </p>
              <p className="mt-1 text-xl font-bold tabular-nums">
                {account.balance == null ? "未登録" : formatYen(account.balance)}
              </p>
              <p className="mt-1 text-[11px] text-muted">
                {account.asOf
                  ? `${account.asOf} の手入力が正。翌日〜今日の記録だけ反映`
                  : "変更から残高を登録"}
              </p>
            </div>
            <EditPopover title={`${account.name}の残高`}>
              <BalanceForm accountId={account.id} />
            </EditPopover>
          </article>
        ))}
      </div>
    </div>
  );
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
