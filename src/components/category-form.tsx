"use client";

import { useEffect, useState, useTransition } from "react";
import { createCategory, updateCategory } from "@/app/actions";
import type { Category, TransactionKind } from "@/lib/types";

type Props = {
  editing?: Category | null;
};

export function CategoryForm({ editing = null }: Props) {
  const [kind, setKind] = useState<TransactionKind>(editing?.kind ?? "expense");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const isEdit = Boolean(editing);

  useEffect(() => {
    setKind(editing?.kind ?? "expense");
    setError(null);
  }, [editing]);

  return (
    <form
      className="grid gap-3 rounded-xl border border-line/80 bg-surface p-4 sm:grid-cols-2"
      action={(fd) => {
        startTransition(async () => {
          const res = isEdit
            ? await updateCategory(fd)
            : await createCategory(fd);
          setError(res?.error ?? null);
        });
      }}
    >
      <h2 className="sm:col-span-2 text-lg font-bold">
        {isEdit ? "項目を編集" : "項目を追加"}
      </h2>
      {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
      <label className="grid gap-1 text-sm">
        <span className="text-muted">名前</span>
        <input
          name="name"
          required
          key={`name-${editing?.id ?? "new"}`}
          defaultValue={editing?.name}
          className="rounded-md border border-line bg-white px-3 py-2"
          placeholder="食費"
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-muted">種別</span>
        <select
          name="kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as TransactionKind)}
          className="rounded-md border border-line bg-white px-3 py-2"
        >
          <option value="expense">支出</option>
          <option value="income">収入</option>
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-muted">色</span>
        <input
          name="color"
          type="color"
          key={`color-${editing?.id ?? "new"}`}
          defaultValue={editing?.color ?? "#0f766e"}
          className="h-10 w-full rounded-md border border-line bg-white px-2"
        />
      </label>
      <div className="flex items-end">
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-accent px-4 py-2 text-white hover:bg-accent-deep disabled:opacity-60"
        >
          {pending ? "保存中…" : isEdit ? "更新" : "追加"}
        </button>
      </div>
      {error ? (
        <p className="sm:col-span-2 text-sm text-expense">{error}</p>
      ) : null}
    </form>
  );
}
