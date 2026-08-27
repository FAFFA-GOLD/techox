"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { createTransaction, updateTransaction } from "@/app/actions";
import { AssetAccountSelect } from "@/components/asset-account-select";
import type {
  AssetAccount,
  Category,
  Transaction,
  TransactionKind,
} from "@/lib/types";

export type TransactionDraft = {
  date: string;
  amount: number;
  kind: TransactionKind;
  category_id: string | null;
  memo: string | null;
  recurring_rule_id: string | null;
  asset_account_id?: string | null;
};

type Props = {
  categories: Category[];
  accounts?: AssetAccount[];
  defaultDate?: string;
  editing?: Transaction | null;
  confirming?: TransactionDraft | null;
  cancelHref?: string;
};

export function TransactionForm({
  categories,
  accounts = [],
  defaultDate,
  editing = null,
  confirming = null,
  cancelHref,
}: Props) {
  const router = useRouter();
  const seed = editing ?? confirming;
  const seedKey =
    editing?.id ?? confirming?.recurring_rule_id ?? confirming?.date ?? "new";
  const [kind, setKind] = useState<"expense" | "income">(
    seed?.kind ?? "expense",
  );
  const [categoryId, setCategoryId] = useState(seed?.category_id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const filtered = categories.filter((c) => c.kind === kind);
  const isEdit = Boolean(editing);
  const isConfirm = Boolean(confirming) && !isEdit;

  useEffect(() => {
    setKind(seed?.kind ?? "expense");
    setCategoryId(seed?.category_id ?? "");
    setError(null);
  }, [seedKey, seed?.kind, seed?.category_id]);

  function changeKind(next: "expense" | "income") {
    setKind(next);
    setCategoryId((prev) => {
      if (!prev) return "";
      return categories.some((c) => c.id === prev && c.kind === next) ? prev : "";
    });
  }

  function cancel() {
    if (cancelHref) router.push(cancelHref);
  }

  return (
    <form
      className="grid gap-3 rounded-xl border border-line/80 bg-surface p-4 sm:grid-cols-2"
      action={(fd) => {
        startTransition(async () => {
          const res = isEdit
            ? await updateTransaction(fd)
            : await createTransaction(fd);
          setError(res?.error ?? null);
          if (!res?.error && cancelHref && (isEdit || isConfirm)) {
            router.push(cancelHref);
            router.refresh();
          }
        });
      }}
    >
      <h2 className="sm:col-span-2 text-lg font-bold">
        {isEdit
          ? "取引を編集"
          : isConfirm
            ? "定期予定の実額を確定"
            : "取引を追加"}
      </h2>
      {isConfirm ? (
        <p className="sm:col-span-2 text-sm text-muted">
          予定額を実際の金額に直して保存すると、明細に確定され、同じ定期の「予定」はこの期間では消えます。
        </p>
      ) : null}
      {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
      <input
        type="hidden"
        name="recurring_rule_id"
        value={
          editing?.recurring_rule_id ?? confirming?.recurring_rule_id ?? ""
        }
      />
      <label className="grid gap-1 text-sm">
        <span className="text-muted">日付</span>
        <input
          name="date"
          type="date"
          required
          key={`date-${seedKey}`}
          defaultValue={
            seed?.date ?? defaultDate ?? format(new Date(), "yyyy-MM-dd")
          }
          className="rounded-md border border-line bg-white px-3 py-2"
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-muted">金額（円）</span>
        <input
          name="amount"
          type="number"
          min={1}
          required
          inputMode="numeric"
          key={`amount-${seedKey}`}
          defaultValue={seed?.amount}
          className="rounded-md border border-line bg-white px-3 py-2"
          placeholder="1200"
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-muted">種別</span>
        <select
          name="kind"
          value={kind}
          onChange={(e) => changeKind(e.target.value as "expense" | "income")}
          className="rounded-md border border-line bg-white px-3 py-2"
        >
          <option value="expense">支出</option>
          <option value="income">収入</option>
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-muted">項目</span>
        <select
          name="category_id"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="rounded-md border border-line bg-white px-3 py-2"
        >
          <option value="">未分類</option>
          {filtered.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      {accounts.length > 0 ? (
        <AssetAccountSelect
          key={`acct-${seedKey}`}
          accounts={accounts}
          defaultValue={
            editing?.asset_account_id ?? confirming?.asset_account_id ?? ""
          }
        />
      ) : null}
      <label className="sm:col-span-2 grid gap-1 text-sm">
        <span className="text-muted">メモ</span>
        <input
          name="memo"
          key={`memo-${seedKey}`}
          defaultValue={seed?.memo ?? ""}
          className="rounded-md border border-line bg-white px-3 py-2"
          placeholder="任意"
        />
      </label>
      <div className="sm:col-span-2 flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-accent px-4 py-2 text-white hover:bg-accent-deep disabled:opacity-60"
        >
          {pending
            ? "保存中…"
            : isEdit
              ? "更新"
              : isConfirm
                ? "実額で確定"
                : "保存"}
        </button>
        {isEdit || isConfirm ? (
          <button
            type="button"
            onClick={cancel}
            className="rounded-md border border-line px-4 py-2 text-sm text-muted"
          >
            キャンセル
          </button>
        ) : null}
      </div>
      {error ? <p className="sm:col-span-2 text-sm text-expense">{error}</p> : null}
    </form>
  );
}
