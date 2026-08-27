"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import {
  createDailySpendEntry,
  deleteDailySpendEntries,
  deleteDailySpendEntry,
  moveDailySpendEntries,
  updateDailySpendEntry,
} from "@/app/actions";
import { formatYen } from "@/lib/money";
import type { DailySpendCategory, DailySpendEntry } from "@/lib/types";
import { resolveCategoryBudget } from "@/lib/types";

type Props = {
  monthKey: string;
  categories: DailySpendCategory[];
  entries: DailySpendEntry[];
  categoryId: string;
};

export function DailySpendCategoryList({
  monthKey,
  categories,
  entries,
  categoryId,
}: Props) {
  const activeCategory =
    categories.find((c) => c.id === categoryId) ?? categories[0];
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<DailySpendEntry | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkPending, startBulk] = useTransition();

  const filtered = useMemo(
    () =>
      entries
        .filter((e) => e.category_id === activeCategory?.id)
        .sort((a, b) =>
          a.date === b.date
            ? a.created_at.localeCompare(b.created_at)
            : a.date.localeCompare(b.date),
        ),
    [entries, activeCategory?.id],
  );

  const total = filtered.reduce((s, e) => s + e.amount, 0);
  const budget = activeCategory
    ? resolveCategoryBudget(
        activeCategory.name,
        monthKey,
        activeCategory.monthly_budget,
      )
    : 0;

  const allSelected =
    filtered.length > 0 && filtered.every((e) => selected.has(e.id));

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((e) => e.id)));
    }
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function calListUrl(catId: string) {
    return `/calendar?month=${monthKey}&view=list&category=${catId}`;
  }

  if (!activeCategory) return null;

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap gap-2">
        {categories.map((c) => {
          const count = entries.filter((e) => e.category_id === c.id).length;
          const active = c.id === activeCategory.id;
          return (
            <Link
              key={c.id}
              href={calListUrl(c.id)}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition ${
                active
                  ? "border-accent bg-accent text-white"
                  : "border-line bg-white/80 text-muted hover:text-ink"
              }`}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: c.color }}
              />
              {c.name}
              <span
                className={`tabular-nums text-xs ${active ? "text-white/80" : ""}`}
              >
                {count}
              </span>
            </Link>
          );
        })}
      </div>

      <div className="rounded-xl border border-line/80 bg-surface p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">{activeCategory.name} の一覧</h2>
            <p className="mt-1 text-sm text-muted">
              {filtered.length} 件 · 合計{" "}
              <span className="font-semibold tabular-nums text-expense">
                {formatYen(total)}
              </span>
              {budget > 0 ? (
                <>
                  {" "}
                  · 予算 {formatYen(budget)}
                  {budget - total < 0 ? (
                    <>
                      （超過 {formatYen(Math.abs(budget - total))}）
                    </>
                  ) : (
                    <>（残り {formatYen(budget - total)}）</>
                  )}
                </>
              ) : null}
            </p>
          </div>
        </div>

        {filtered.length > 0 ? (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-b border-line/60 pb-3">
            <label className="flex items-center gap-2 text-sm text-muted">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                className="rounded border-line"
              />
              全選択
            </label>
            <span className="text-xs text-muted">
              {selected.size > 0 ? `${selected.size}件選択中` : ""}
            </span>
            {selected.size > 0 ? (
              <>
                <BulkDeleteForm
                  ids={[...selected]}
                  pending={bulkPending}
                  onDone={() => {
                    setSelected(new Set());
                    setBulkError(null);
                  }}
                  onError={setBulkError}
                  startBulk={startBulk}
                />
                <BulkMoveForm
                  ids={[...selected]}
                  categories={categories}
                  pending={bulkPending}
                  onDone={() => {
                    setSelected(new Set());
                    setBulkError(null);
                  }}
                  onError={setBulkError}
                  startBulk={startBulk}
                />
              </>
            ) : null}
          </div>
        ) : null}
        {bulkError ? (
          <p className="mt-2 text-sm text-expense">{bulkError}</p>
        ) : null}

        {filtered.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
            この月の「{activeCategory.name}」の記録はまだありません。
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-line/60">
            {filtered.map((e) => (
              <li key={e.id} className="py-2">
                {editing?.id === e.id ? (
                  <ListEntryForm
                    categories={categories}
                    editing={e}
                    onCancel={() => setEditing(null)}
                    onSaved={() => setEditing(null)}
                  />
                ) : (
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <input
                      type="checkbox"
                      checked={selected.has(e.id)}
                      onChange={() => toggleOne(e.id)}
                      className="rounded border-line"
                      aria-label="選択"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setEditing(editing?.id === e.id ? null : e)
                      }
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <span className="text-sm font-medium tabular-nums">
                          {e.date}
                        </span>
                        <span className="text-sm tabular-nums text-expense">
                          {formatYen(e.amount)}
                        </span>
                        {(e.points_amount ?? 0) > 0 ? (
                          <span className="text-xs tabular-nums text-muted">
                            Pt {formatYen(e.points_amount)}
                          </span>
                        ) : null}
                        {e.memo ? (
                          <span className="truncate text-sm text-muted">
                            {e.memo}
                          </span>
                        ) : null}
                      </div>
                    </button>
                    <button
                      type="button"
                      className="text-xs text-accent"
                      onClick={() => setEditing(e)}
                    >
                      編集
                    </button>
                    <form action={deleteDailySpendEntry}>
                      <input type="hidden" name="id" value={e.id} />
                      <button
                        type="submit"
                        className="text-xs text-muted hover:text-expense"
                      >
                        削除
                      </button>
                    </form>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 border-t border-line/60 pt-4">
          <ListEntryForm
            categories={categories}
            defaultCategoryId={activeCategory.id}
            defaultDate={`${monthKey}-01`}
            onSaved={() => {}}
          />
        </div>
      </div>
    </section>
  );
}

function BulkDeleteForm({
  ids,
  pending,
  onDone,
  onError,
  startBulk,
}: {
  ids: string[];
  pending: boolean;
  onDone: () => void;
  onError: (msg: string | null) => void;
  startBulk: (fn: () => Promise<void>) => void;
}) {
  return (
    <form
      action={(fd) => {
        startBulk(async () => {
          const res = await deleteDailySpendEntries(fd);
          onError(res?.error ?? null);
          if (!res?.error) onDone();
        });
      }}
    >
      {ids.map((id) => (
        <input key={id} type="hidden" name="id" value={id} />
      ))}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-expense/40 px-3 py-1.5 text-xs text-expense hover:bg-red-50 disabled:opacity-60"
      >
        選択を削除
      </button>
    </form>
  );
}

function BulkMoveForm({
  ids,
  categories,
  pending,
  onDone,
  onError,
  startBulk,
}: {
  ids: string[];
  categories: DailySpendCategory[];
  pending: boolean;
  onDone: () => void;
  onError: (msg: string | null) => void;
  startBulk: (fn: () => Promise<void>) => void;
}) {
  const [target, setTarget] = useState(categories[0]?.id ?? "");

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      action={(fd) => {
        startBulk(async () => {
          const res = await moveDailySpendEntries(fd);
          onError(res?.error ?? null);
          if (!res?.error) onDone();
        });
      }}
    >
      {ids.map((id) => (
        <input key={id} type="hidden" name="id" value={id} />
      ))}
      <select
        name="category_id"
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        className="rounded-md border border-line bg-white px-2 py-1.5 text-xs"
      >
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}へ移動
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-line px-3 py-1.5 text-xs hover:bg-white disabled:opacity-60"
      >
        用途を一括変更
      </button>
    </form>
  );
}

function ListEntryForm({
  categories,
  editing,
  defaultCategoryId,
  defaultDate,
  onCancel,
  onSaved,
}: {
  categories: DailySpendCategory[];
  editing?: DailySpendEntry;
  defaultCategoryId?: string;
  defaultDate?: string;
  onCancel?: () => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [pending, startTransition] = useTransition();
  const [categoryId, setCategoryId] = useState(
    editing?.category_id ?? defaultCategoryId ?? categories[0]?.id ?? "",
  );
  const isEdit = Boolean(editing);

  return (
    <form
      key={`${editing?.id ?? "new"}-${formKey}`}
      className="grid gap-2 rounded-lg border border-line/70 bg-white/70 p-3"
      action={(fd) => {
        startTransition(async () => {
          const res = isEdit
            ? await updateDailySpendEntry(fd)
            : await createDailySpendEntry(fd);
          setError(res?.error ?? null);
          if (!res?.error) {
            onSaved();
            if (isEdit) onCancel?.();
            else {
              setFormKey((k) => k + 1);
              setCategoryId(defaultCategoryId ?? categories[0]?.id ?? "");
            }
          }
        });
      }}
    >
      <p className="text-sm font-medium">
        {isEdit ? "記録を編集" : "この用途に追加"}
      </p>
      {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
      <input type="hidden" name="category_id" value={categoryId} />
      <label className="grid gap-1 text-sm">
        <span className="text-muted">日付</span>
        <input
          name="date"
          type="date"
          required
          defaultValue={editing?.date ?? defaultDate}
          className="rounded-md border border-line bg-white px-3 py-2"
        />
      </label>
      <div className="grid gap-1">
        <span className="text-sm text-muted">用途</span>
        <div className="flex flex-wrap gap-1.5">
          {categories.map((c) => {
            const active = c.id === categoryId;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategoryId(c.id)}
                className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
                  active
                    ? "text-white"
                    : "border border-line bg-white text-muted hover:text-ink"
                }`}
                style={active ? { backgroundColor: c.color } : undefined}
              >
                {c.name}
              </button>
            );
          })}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="grid min-w-0 gap-1 text-sm">
          <span className="text-muted">金額（円）</span>
          <input
            name="amount"
            type="number"
            min={0}
            defaultValue={editing?.amount ?? ""}
            className="w-full min-w-0 rounded-md border border-line bg-white px-3 py-2"
            placeholder="1200"
          />
        </label>
        <label className="grid min-w-0 gap-1 text-sm">
          <span className="text-muted">ポイント決済</span>
          <input
            name="points_amount"
            type="number"
            min={0}
            defaultValue={editing?.points_amount ?? ""}
            className="w-full min-w-0 rounded-md border border-line bg-white px-3 py-2"
            placeholder="0"
          />
        </label>
      </div>
      <label className="grid gap-1 text-sm">
        <span className="text-muted">メモ（任意）</span>
        <input
          name="memo"
          defaultValue={editing?.memo ?? ""}
          className="rounded-md border border-line bg-white px-3 py-2"
          placeholder="任意"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending || !categoryId}
          className="rounded-md bg-accent px-4 py-2 text-sm text-white hover:bg-accent-deep disabled:opacity-60"
        >
          {pending ? "保存中…" : isEdit ? "更新" : "追加"}
        </button>
        {isEdit && onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-line px-3 py-2 text-sm text-muted"
          >
            キャンセル
          </button>
        ) : null}
      </div>
      {error ? <p className="text-sm text-expense">{error}</p> : null}
    </form>
  );
}
