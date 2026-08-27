"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { format } from "date-fns";
import {
  deleteBalanceSnapshot,
  upsertBalanceSnapshot,
} from "@/app/actions";
import { formatYen } from "@/lib/money";
import type { BalanceSnapshot } from "@/lib/types";

type Props = {
  snapshots: BalanceSnapshot[];
  periodEnd: string;
  nextPayday: string;
  editingId?: string | null;
};

export function BalanceForm({
  snapshots,
  periodEnd,
  nextPayday,
  editingId = null,
}: Props) {
  const latest = snapshots[0] ?? null;
  const editing = editingId
    ? (snapshots.find((s) => s.id === editingId) ?? null)
    : null;
  const today = format(new Date(), "yyyy-MM-dd");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <section className="grid gap-4">
      <div className="grid gap-3 rounded-xl border border-line/80 bg-surface p-4 sm:grid-cols-2">
        <div>
          <p className="text-xs uppercase tracking-[0.14em] text-muted">
            最新の登録残高
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-accent-deep">
            {latest ? formatYen(latest.balance) : "未登録"}
          </p>
          <p className="mt-1 text-xs text-muted">
            {latest
              ? `${latest.as_of_date} 時点${latest.note ? ` · ${latest.note}` : ""}`
              : "銀行の実残高を日々更新してください"}
          </p>
        </div>
        <div className="rounded-lg border border-line/60 bg-white/70 px-3 py-3 text-sm text-muted">
          <p className="font-medium text-ink">突合の目安</p>
          <p className="mt-1">
            この全体家計の最終日は <span className="text-ink">{periodEnd}</span>
            （次の給料 {nextPayday} の前日）です。
          </p>
          <p className="mt-1">
            最終日の登録残高 ＋ 給料 ≒ 給料日の銀行残高、になるよう日々更新します。
          </p>
        </div>
      </div>

      <form
        key={editing?.id ?? "daily"}
        className="grid gap-3 rounded-xl border border-line/80 bg-surface p-4 sm:grid-cols-3"
        action={(fd) => {
          startTransition(async () => {
            const res = await upsertBalanceSnapshot(fd);
            setError(res?.error ?? null);
            setOk(!res?.error);
          });
        }}
      >
        <h2 className="sm:col-span-3 text-lg font-bold">
          {editing ? "残高を修正" : "残高を更新（日々）"}
        </h2>
        <div className="sm:col-span-3 grid gap-1.5 text-sm text-muted">
          <p>
            同じ日付で保存し直すとその日の残高が上書きされます。登録した日の残高を起点に、その翌日以降の収支だけで先の予測を組み直します。
          </p>
          <p className="rounded-md border border-line/70 bg-white/70 px-3 py-2 text-[13px] leading-relaxed text-ink">
            <span className="font-medium">残高更新のコツ</span>
            <br />
            ・支出がない日に残高を更新すると安全です
            <br />
            ・支出がある日に更新するなら、その日の支出が銀行に落ちたあとに行ってください
            <br />
            ・落ちたか確認できないときは、支出日以外の日にもう一度残高を更新してください
            <br />
            （同じ日の支出は「残高に含まれ済み」とみなし、予測では再控除しません）
          </p>
        </div>
        <label className="grid gap-1 text-sm">
          <span className="text-muted">日付</span>
          <input
            name="as_of_date"
            type="date"
            required
            defaultValue={editing?.as_of_date ?? today}
            className="rounded-md border border-line bg-white px-3 py-2"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-muted">残高（円）</span>
          <input
            name="balance"
            type="number"
            required
            defaultValue={editing?.balance ?? latest?.balance ?? ""}
            className="rounded-md border border-line bg-white px-3 py-2"
            placeholder="500000"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-muted">メモ</span>
          <input
            name="note"
            defaultValue={editing?.note ?? ""}
            className="rounded-md border border-line bg-white px-3 py-2"
            placeholder="任意"
          />
        </label>
        <div className="sm:col-span-3 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-accent px-4 py-2 text-white hover:bg-accent-deep disabled:opacity-60"
          >
            {pending ? "保存中…" : editing ? "この日の残高を更新" : "残高を保存"}
          </button>
          {editing ? (
            <Link href="/dashboard" className="text-sm text-muted underline">
              新規更新に戻る
            </Link>
          ) : null}
          {ok && !error ? (
            <span className="text-sm text-income">保存しました</span>
          ) : null}
          {error ? <span className="text-sm text-expense">{error}</span> : null}
        </div>
      </form>

      <div className="grid gap-3">
        <h3 className="text-lg font-bold">残高の履歴</h3>
        {snapshots.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line bg-white/50 px-4 py-6 text-sm text-muted">
            まだ残高履歴がありません
          </p>
        ) : (
          <ul className="divide-y divide-line/70 overflow-hidden rounded-xl border border-line/80 bg-surface">
            {snapshots.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center gap-3 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{s.as_of_date}</p>
                  {s.note ? (
                    <p className="text-xs text-muted">{s.note}</p>
                  ) : null}
                  {s.as_of_date === periodEnd ? (
                    <p className="text-xs text-accent">全体家計の最終日の記録</p>
                  ) : null}
                </div>
                <p className="tabular-nums text-sm font-medium">
                  {formatYen(s.balance)}
                </p>
                <Link
                  href={`/dashboard?editBalance=${s.id}`}
                  className="text-xs text-accent hover:underline"
                >
                  編集
                </Link>
                <form action={deleteBalanceSnapshot}>
                  <input type="hidden" name="id" value={s.id} />
                  <button
                    type="submit"
                    className="text-xs text-muted hover:text-expense"
                  >
                    削除
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
