"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { importTransactionsCsv } from "@/app/actions";
import { periodNavButtonClassName } from "@/components/month-nav";

type Props = {
  monthKey: string;
  periodQuery: string;
};

export function TransactionsCsvPanel({ monthKey, periodQuery }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [pending, startTransition] = useTransition();

  const exportHref = `/api/export/transactions?month=${monthKey}`;
  const monthLabel = `${monthKey.slice(0, 4)}年${Number(monthKey.slice(5, 7))}月`;

  function shiftMonth(delta: number): string {
    const [y, m] = monthKey.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    const yy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${yy}-${mm}`;
  }

  return (
    <section className="grid gap-3 rounded-xl border border-line/80 bg-white/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">明細 CSV（月別）</h2>
        <div className="flex items-center gap-2 text-sm">
          <Link
            href={`/transactions?${periodQuery}&csvMonth=${shiftMonth(-1)}`}
            aria-label="前月へ"
            className={periodNavButtonClassName}
          >
            ← 前月
          </Link>
          <span className="pointer-events-none min-w-24 text-center font-medium">
            {monthLabel}
          </span>
          <Link
            href={`/transactions?${periodQuery}&csvMonth=${shiftMonth(1)}`}
            aria-label="次月へ"
            className={periodNavButtonClassName}
          >
            次月 →
          </Link>
        </div>
      </div>
      <p className="text-sm text-muted">
        登録済みの明細のみが対象です（定期の予定・カード・ローンは含みません）。
        初期投入や大きな整理用で、読み込むとその月の明細をすべて置き換えます。
        日常の修正は画面上の個別編集で十分です。給与期の集計は明細の日付から自動で反映されます。
      </p>
      <div className="flex flex-wrap gap-2">
        <a
          href={exportHref}
          className="rounded-md border border-line bg-white px-3 py-2 text-sm hover:bg-white"
        >
          CSV出力（Shift_JIS）
        </a>
        <a
          href={`${exportHref}&encoding=utf8`}
          className="rounded-md border border-line bg-white px-3 py-2 text-sm text-muted hover:text-ink"
        >
          CSV出力（UTF-8）
        </a>
      </div>
      <form
        className="grid gap-3 border-t border-line/70 pt-3"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          setMessage(null);
          if (!confirmed) {
            setError("上書きする前に確認チェックを入れてください");
            return;
          }
          const fd = new FormData(e.currentTarget);
          startTransition(async () => {
            const res = await importTransactionsCsv(fd);
            if (res?.error) {
              setError(res.error);
              return;
            }
            setMessage(
              `${monthLabel}の明細を置き換えました（${res?.imported ?? 0}件）`,
            );
            setConfirmed(false);
            router.refresh();
          });
        }}
      >
        <input type="hidden" name="month" value={monthKey} />
        <label className="grid gap-1 text-sm">
          <span className="text-muted">CSVファイルを読み込み（月を上書き）</span>
          <input
            name="file"
            type="file"
            accept=".csv,text/csv"
            required
            className="rounded-md border border-line bg-white px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-accent/10 file:px-2 file:py-1"
          />
        </label>
        <label className="flex items-start gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-1"
          />
          <span>
            {monthLabel}
            の既存明細をすべて削除し、CSVの内容で置き換えることを理解しました
          </span>
        </label>
        {error ? <p className="text-sm text-expense">{error}</p> : null}
        {message ? <p className="text-sm text-income">{message}</p> : null}
        <button
          type="submit"
          disabled={pending}
          className="w-fit rounded-md bg-accent px-4 py-2.5 text-sm text-white hover:bg-accent-deep disabled:opacity-60"
        >
          {pending ? "読み込み中…" : "CSVを読み込んで上書き"}
        </button>
      </form>
    </section>
  );
}
