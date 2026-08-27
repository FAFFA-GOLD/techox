"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { upsertSuicaBalance } from "@/app/actions";
import { formatYen } from "@/lib/money";
import type { SuicaDisplayBalance } from "@/lib/types";
import { ConfidentialExpensePanel } from "@/components/confidential-expense-panel";

type Props = {
  suica: SuicaDisplayBalance;
  /** この月の交通費使用額（参考表示） */
  transportMonthSpent: number;
  transportMonthBudget: number;
  transportMonthRemaining: number;
  confidentialMonthSpent: number;
  confidentialEntryCount: number;
};

export function SuicaBalancePanel({
  suica,
  transportMonthSpent,
  transportMonthBudget,
  transportMonthRemaining,
  confidentialMonthSpent,
  confidentialEntryCount,
}: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const today = format(new Date(), "yyyy-MM-dd");

  async function onSave(fd: FormData) {
    setPending(true);
    setError(null);
    setOk(false);
    try {
      const res = await upsertSuicaBalance(fd);
      if (res?.error) {
        setError(res.error);
        return;
      }
      setOk(true);
      setFormKey((k) => k + 1);
      router.refresh();
    } catch {
      setError("保存に失敗しました");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="grid gap-3 rounded-xl border border-line/80 bg-surface p-4 lg:grid-cols-3">
      <div className="rounded-lg border border-[#4d7c0f]/35 bg-[#4d7c0f]/8 p-3">
        <p className="text-xs uppercase tracking-wide text-muted">交通費（月予算）</p>
        <p
          className={`mt-1 text-2xl font-bold tabular-nums ${
            transportMonthRemaining < 0 ? "text-expense" : "text-income"
          }`}
        >
          {transportMonthRemaining < 0
            ? `超過 ${formatYen(Math.abs(transportMonthRemaining))}`
            : formatYen(transportMonthRemaining)}
        </p>
        <p className="mt-1 text-xs text-muted">
          予算 {formatYen(transportMonthBudget)} − 使用{" "}
          {formatYen(transportMonthSpent)}
          {transportMonthRemaining < 0 ? "（超過）" : "（残り＝月末の利益目安）"}
        </p>
        <p className="mt-2 text-[11px] leading-relaxed text-muted">
          毎月支給分から日々の交通費を引いた残りです。月末に残れば利益として把握します。毎日の支出の月合計には含めません。
        </p>
      </div>

      <ConfidentialExpensePanel
        monthSpent={confidentialMonthSpent}
        entryCount={confidentialEntryCount}
      />

      <div className="rounded-lg border border-[#0e7490]/35 bg-[#0e7490]/8 p-3">
        <p className="text-xs uppercase tracking-wide text-muted">Suica（カード残高）</p>
        <p
          className={`mt-1 text-2xl font-bold tabular-nums ${
            suica.balance == null
              ? "text-muted"
              : suica.balance < 0
                ? "text-expense"
                : "text-[#0e7490]"
          }`}
        >
          {suica.balance == null ? "未登録" : formatYen(suica.balance)}
        </p>
        <p className="mt-1 text-xs text-muted">
          {suica.asOf
            ? `${suica.asOf} 登録 ${formatYen(suica.snapshotBalance ?? 0)} − 以降の交通費 ${formatYen(suica.spentAfter)}`
            : "残高を登録すると推定残高を表示します"}
        </p>
        <p className="mt-2 text-[11px] leading-relaxed text-muted">
          交通費と同じ科目の支出で減ります。公式アプリ確認後に残高を入れ直すとその金額が正になります（細かなズレは運用で更新）。月合計・交通費予算とは独立です。
        </p>
      </div>

      <form
        key={formKey}
        className="grid gap-2 rounded-lg border border-line/70 bg-white/80 p-3 lg:col-span-3 sm:grid-cols-4"
        action={onSave}
      >
        <p className="sm:col-span-4 text-sm font-medium">Suica 残高を更新</p>
        <input
          name="as_of_date"
          type="date"
          required
          defaultValue={today}
          className="rounded-md border border-line px-3 py-2 text-sm"
        />
        <input
          name="balance"
          type="number"
          min={0}
          required
          placeholder="カード残高"
          className="rounded-md border border-line px-3 py-2 text-sm"
        />
        <input
          name="note"
          placeholder="メモ（任意）"
          className="rounded-md border border-line px-3 py-2 text-sm sm:col-span-1"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-accent px-3 py-2 text-sm text-white hover:bg-accent-deep disabled:opacity-60"
        >
          {pending ? "処理中…" : "残高を正として保存"}
        </button>
        {ok ? (
          <p className="sm:col-span-4 text-sm text-income">保存しました</p>
        ) : null}
        {error ? (
          <p className="sm:col-span-4 text-sm text-expense">{error}</p>
        ) : null}
      </form>
    </section>
  );
}
