"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { restoreLocalBackup, saveLocalBackup } from "@/app/actions";

type Props = {
  backups: { name: string; exportedAt?: string; counts?: Record<string, number> }[];
};

export function BackupPanel({ backups }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState(backups[0]?.name ?? "");
  const [confirmRestore, setConfirmRestore] = useState(false);

  return (
    <section className="grid max-w-lg gap-4 rounded-xl border border-line/80 bg-surface p-5">
      <h2 className="text-lg font-bold">データバックアップ</h2>
      <p className="text-sm text-muted">
        家計データ全体を PC 上の <code className="text-ink">backups/</code>{" "}
        に保存します。CSV の一括上書き前などに使います。
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          className="rounded-md bg-accent px-4 py-2.5 text-sm text-white hover:bg-accent-deep disabled:opacity-60"
          onClick={() => {
            setError(null);
            setMessage(null);
            startTransition(async () => {
              const res = await saveLocalBackup("pre-csv");
              if (res?.error) {
                setError(res.error);
                return;
              }
              setMessage(`保存しました: ${res?.dir}`);
              router.refresh();
            });
          }}
        >
          {pending ? "処理中…" : "今すぐローカルへ保存"}
        </button>
        <a
          href="/api/export/backup"
          className="rounded-md border border-line bg-white px-4 py-2.5 text-sm hover:bg-white"
        >
          JSONをダウンロード
        </a>
      </div>

      {backups.length > 0 ? (
        <div className="grid gap-3 border-t border-line/70 pt-3">
          <label className="grid gap-1 text-sm">
            <span className="text-muted">保存済みバックアップ</span>
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="rounded-md border border-line bg-white px-3 py-2"
            >
              {backups.map((b) => (
                <option key={b.name} value={b.name}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-start gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={confirmRestore}
              onChange={(e) => setConfirmRestore(e.target.checked)}
              className="mt-1"
            />
            <span>
              現在のデータをすべて削除し、選択したバックアップで置き換えることを理解しました
            </span>
          </label>
          <button
            type="button"
            disabled={pending || !selected}
            className="w-fit rounded-md border border-expense/40 bg-white px-4 py-2.5 text-sm text-expense hover:bg-white disabled:opacity-60"
            onClick={() => {
              setError(null);
              setMessage(null);
              if (!confirmRestore) {
                setError("復元する前に確認チェックを入れてください");
                return;
              }
              startTransition(async () => {
                const res = await restoreLocalBackup(selected);
                if (res?.error) {
                  setError(res.error);
                  return;
                }
                setMessage(`復元しました（${res?.summary}）`);
                setConfirmRestore(false);
                router.refresh();
              });
            }}
          >
            選択したバックアップで復元
          </button>
        </div>
      ) : (
        <p className="text-sm text-muted">まだローカル保存はありません。</p>
      )}

      {error ? <p className="text-sm text-expense">{error}</p> : null}
      {message ? <p className="text-sm text-income">{message}</p> : null}
    </section>
  );
}
