"use client";

import { useEffect, useState, useTransition } from "react";
import { format } from "date-fns";
import { createRecurring, updateRecurring } from "@/app/actions";
import { AssetAccountSelect } from "@/components/asset-account-select";
import type {
  AssetAccount,
  Category,
  RecurringRule,
  TransactionKind,
} from "@/lib/types";

type Props = {
  categories: Category[];
  accounts?: AssetAccount[];
  editing?: RecurringRule | null;
  onCancelEdit?: () => void;
};

export function RecurringForm({
  categories,
  accounts = [],
  editing = null,
  onCancelEdit,
}: Props) {
  const editingId = editing?.id ?? null;
  const [kind, setKind] = useState<TransactionKind>(editing?.kind ?? "expense");
  const [useLastDay, setUseLastDay] = useState(
    editing ? editing.day_of_month === 31 : false,
  );
  const [categoryId, setCategoryId] = useState(editing?.category_id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const filtered = categories.filter((c) => c.kind === kind);
  const isEdit = Boolean(editing);

  // editing の参照が変わるたびに走ると種別が expense に戻ることがあるため、値で同期する
  useEffect(() => {
    setKind(editing?.kind ?? "expense");
    setUseLastDay(editing ? editing.day_of_month === 31 : false);
    setCategoryId(editing?.category_id ?? "");
    setError(null);
  }, [
    editingId,
    editing?.kind,
    editing?.category_id,
    editing?.day_of_month,
  ]);

  function changeKind(next: TransactionKind) {
    setKind(next);
    setCategoryId((prev) => {
      if (!prev) return "";
      return categories.some((c) => c.id === prev && c.kind === next) ? prev : "";
    });
  }

  return (
    <form
      className="grid gap-3 rounded-xl border border-line/80 bg-surface p-4 sm:grid-cols-2"
      action={(fd) => {
        startTransition(async () => {
          const res = isEdit
            ? await updateRecurring(fd)
            : await createRecurring(fd);
          setError(res?.error ?? null);
          if (!res?.error && isEdit) onCancelEdit?.();
        });
      }}
    >
      <h2 className="sm:col-span-2 text-lg font-bold">
        {isEdit ? "定期ルールを編集" : "定期ルールを追加"}
      </h2>
      {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
      {/* 制御コンポーネントでも確実に送る */}
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="category_id" value={categoryId} />
      <label className="grid gap-1 text-sm">
        <span className="text-muted">名前</span>
        <input
          name="name"
          required
          key={`name-${editingId ?? "new"}`}
          defaultValue={editing?.name}
          className="rounded-md border border-line bg-white px-3 py-2"
          placeholder="家賃 / 給与"
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-muted">金額（円）</span>
        <input
          name="amount"
          type="number"
          min={1}
          required
          key={`amount-${editingId ?? "new"}`}
          defaultValue={editing?.amount}
          className="rounded-md border border-line bg-white px-3 py-2"
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-muted">種別</span>
        <select
          value={kind}
          onChange={(e) => changeKind(e.target.value as TransactionKind)}
          className="rounded-md border border-line bg-white px-3 py-2"
        >
          <option value="expense">支出</option>
          <option value="income">収入</option>
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-muted">項目</span>
        <select
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
      <div className="grid gap-2 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="use_last_day"
            checked={useLastDay}
            onChange={(e) => setUseLastDay(e.target.checked)}
          />
          <span>毎月月末（給料日など）</span>
        </label>
        {!useLastDay ? (
          <label className="grid gap-1">
            <span className="text-muted">毎月の日（1〜31・無い日は月末）</span>
            <input
              name="day_of_month"
              type="number"
              min={1}
              max={31}
              key={`day-${editingId ?? "new"}-${useLastDay}`}
              defaultValue={editing?.day_of_month ?? 1}
              className="rounded-md border border-line bg-white px-3 py-2"
            />
          </label>
        ) : (
          <input type="hidden" name="day_of_month" value={31} />
        )}
      </div>
      <label className="grid gap-1 text-sm">
        <span className="text-muted">開始日</span>
        <input
          name="start_date"
          type="date"
          required
          key={`start-${editingId ?? "new"}`}
          defaultValue={
            editing?.start_date ?? format(new Date(), "yyyy-MM-01")
          }
          className="rounded-md border border-line bg-white px-3 py-2"
        />
      </label>
      <label className="sm:col-span-2 grid gap-1 text-sm">
        <span className="text-muted">終了日（任意）</span>
        <input
          name="end_date"
          type="date"
          key={`end-${editingId ?? "new"}`}
          defaultValue={editing?.end_date ?? ""}
          className="rounded-md border border-line bg-white px-3 py-2"
        />
      </label>
      {accounts.length > 0 ? (
        <AssetAccountSelect
          key={`acct-${editingId ?? "new"}`}
          accounts={accounts}
          defaultValue={editing?.asset_account_id ?? ""}
        />
      ) : null}
      <div className="sm:col-span-2 flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-accent px-4 py-2 text-white hover:bg-accent-deep disabled:opacity-60"
        >
          {pending ? "保存中…" : isEdit ? "更新" : "追加"}
        </button>
        {isEdit ? (
          <button
            type="button"
            onClick={onCancelEdit}
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
