"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  createCreditCard,
  deleteCardPayment,
  deleteCreditCard,
  upsertCardPayment,
  updateCreditCard,
} from "@/app/actions";
import { AssetAccountSelect } from "@/components/asset-account-select";
import { formatYen } from "@/lib/money";
import type { AssetAccount, CreditCard } from "@/lib/types";
import type { CardScheduleItem } from "@/lib/schedules";

export type { CardScheduleItem };

type Props = {
  cards: CreditCard[];
  accounts?: AssetAccount[];
  schedule: CardScheduleItem[];
  editingCardId?: string | null;
  confirmCardId?: string | null;
  confirmDate?: string | null;
  editPaymentId?: string | null;
  /** スケジュール絞り込み（カード ID） */
  filterCardId?: string | null;
  /** 例: /transactions?period=2026-07&tab=cards */
  basePath?: string;
};

/** basePath のクエリに params をマージ（null/空は削除） */
function withQuery(
  basePath: string,
  params: Record<string, string | null | undefined>,
) {
  const [path, raw = ""] = basePath.split("?");
  const sp = new URLSearchParams(raw);
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === "") sp.delete(key);
    else sp.set(key, value);
  }
  const q = sp.toString();
  return q ? `${path}?${q}` : path;
}

export function CardsClient({
  cards,
  accounts = [],
  schedule,
  editingCardId = null,
  confirmCardId = null,
  confirmDate = null,
  editPaymentId = null,
  filterCardId = null,
  basePath = "/cards",
}: Props) {
  const editingCard = cards.find((c) => c.id === editingCardId) ?? null;
  const confirmItem =
    confirmCardId && confirmDate
      ? (schedule.find(
          (s) =>
            s.isProjected &&
            s.credit_card_id === confirmCardId &&
            s.payment_date === confirmDate,
        ) ?? null)
      : null;
  const editingPayment = editPaymentId
    ? (schedule.find((s) => s.payment_id === editPaymentId) ?? null)
    : null;
  const activeFilter =
    filterCardId && cards.some((c) => c.id === filterCardId)
      ? filterCardId
      : null;
  const scheduleBase = withQuery(basePath, {
    card: activeFilter,
    editCard: null,
    confirmCard: null,
    confirmDate: null,
    editPayment: null,
  });

  return (
    <div className="grid gap-8">
      <CardMasterForm editing={editingCard} accounts={accounts} />
      <CardList
        cards={cards}
        basePath={basePath}
        filterCardId={activeFilter}
      />
      <PaymentConfirmForm
        cards={cards}
        confirming={confirmItem}
        editing={editingPayment}
        basePath={scheduleBase}
      />
      <ScheduleList
        schedule={schedule}
        cards={cards}
        filterCardId={activeFilter}
        basePath={basePath}
      />
    </div>
  );
}

function CardMasterForm({
  editing,
  accounts,
}: {
  editing: CreditCard | null;
  accounts: AssetAccount[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const isEdit = Boolean(editing);

  return (
    <form
      key={editing?.id ?? "new-card"}
      className="grid gap-3 rounded-xl border border-line/80 bg-surface p-4 sm:grid-cols-2"
      action={(fd) => {
        startTransition(async () => {
          const res = isEdit
            ? await updateCreditCard(fd)
            : await createCreditCard(fd);
          setError(res?.error ?? null);
        });
      }}
    >
      <h2 className="sm:col-span-2 text-lg font-bold">
        {isEdit ? "カードを編集" : "カードを追加"}
      </h2>
      <p className="sm:col-span-2 text-sm text-muted">
        予定額（一回払い＋分割）を登録すると、毎月の引落日に自動で「予定」が入ります。各月で実額を確定・修正できます。
      </p>
      {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
      <label className="grid gap-1 text-sm sm:col-span-2">
        <span className="text-muted">カード名</span>
        <input
          name="name"
          required
          defaultValue={editing?.name}
          className="rounded-md border border-line bg-white px-3 py-2"
          placeholder="メインカード"
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-muted">締め日</span>
        <input
          name="closing_day"
          type="number"
          min={1}
          max={31}
          defaultValue={editing?.closing_day ?? 15}
          className="rounded-md border border-line bg-white px-3 py-2"
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-muted">引落日</span>
        <input
          name="payment_day"
          type="number"
          min={1}
          max={31}
          defaultValue={editing?.payment_day ?? 10}
          className="rounded-md border border-line bg-white px-3 py-2"
        />
      </label>
      <label className="grid gap-1 text-sm sm:col-span-2">
        <span className="text-muted">引落月</span>
        <select
          name="payment_month_offset"
          defaultValue={editing?.payment_month_offset ?? 1}
          className="rounded-md border border-line bg-white px-3 py-2"
        >
          <option value={0}>締めと同月</option>
          <option value={1}>翌月（例: 15日締め→翌月10日）</option>
          <option value={2}>翌々月</option>
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-muted">予定・一回払い（円）</span>
        <input
          name="default_one_time_amount"
          type="number"
          min={0}
          defaultValue={editing?.default_one_time_amount ?? 0}
          className="rounded-md border border-line bg-white px-3 py-2"
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-muted">予定・分割払い（円）</span>
        <input
          name="default_installment_amount"
          type="number"
          min={0}
          defaultValue={editing?.default_installment_amount ?? 0}
          className="rounded-md border border-line bg-white px-3 py-2"
        />
      </label>
      {accounts.length > 0 ? (
        <AssetAccountSelect
          accounts={accounts}
          defaultValue={editing?.asset_account_id ?? ""}
          label="引落口座"
        />
      ) : null}
      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-accent px-4 py-2 text-white hover:bg-accent-deep disabled:opacity-60"
        >
          {pending ? "保存中…" : isEdit ? "更新" : "追加"}
        </button>
      </div>
      {error ? <p className="sm:col-span-2 text-sm text-expense">{error}</p> : null}
    </form>
  );
}

function CardList({
  cards,
  basePath,
  filterCardId,
}: {
  cards: CreditCard[];
  basePath: string;
  filterCardId: string | null;
}) {
  if (cards.length === 0) {
    return (
      <p className="text-sm text-muted">カードが未登録です。</p>
    );
  }
  return (
    <ul className="divide-y divide-line/70 overflow-hidden rounded-xl border border-line/80 bg-surface">
      {cards.map((c) => {
        const planned = c.default_one_time_amount + c.default_installment_amount;
        const filtered = filterCardId === c.id;
        return (
          <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{c.name}</p>
              <p className="text-xs text-muted">
                {c.closing_day}日締め /{" "}
                {c.payment_month_offset === 0
                  ? "同月"
                  : c.payment_month_offset === 1
                    ? "翌月"
                    : "翌々月"}
                {c.payment_day}日引落 · 予定合計 {formatYen(planned)}
              </p>
            </div>
            <Link
              href={withQuery(basePath, {
                card: c.id,
                editCard: null,
                confirmCard: null,
                confirmDate: null,
                editPayment: null,
              })}
              className={`text-xs ${filtered ? "font-medium text-accent" : "text-muted hover:text-accent"}`}
            >
              {filtered ? "表示中" : "このカードだけ"}
            </Link>
            <Link
              href={withQuery(basePath, {
                editCard: c.id,
                card: filterCardId,
                confirmCard: null,
                confirmDate: null,
                editPayment: null,
              })}
              className="text-xs text-accent"
            >
              編集
            </Link>
            <form action={deleteCreditCard}>
              <input type="hidden" name="id" value={c.id} />
              <button type="submit" className="text-xs text-muted hover:text-expense">
                削除
              </button>
            </form>
          </li>
        );
      })}
    </ul>
  );
}

function PaymentConfirmForm({
  cards,
  confirming,
  editing,
  basePath,
}: {
  cards: CreditCard[];
  confirming: CardScheduleItem | null;
  editing: CardScheduleItem | null;
  basePath: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const seed = editing ?? confirming;
  if (!seed || cards.length === 0) return null;

  const isEdit = Boolean(editing);

  return (
    <form
      key={seed.id}
      className="grid gap-3 rounded-xl border border-accent/30 bg-surface p-4 sm:grid-cols-2"
      action={(fd) => {
        startTransition(async () => {
          const res = await upsertCardPayment(fd);
          setError(res?.error ?? null);
          if (!res?.error) {
            router.push(basePath);
            router.refresh();
          }
        });
      }}
    >
      <h2 className="sm:col-span-2 text-lg font-bold">
        {isEdit ? "引落を編集" : "引落予定の実額を確定"}
      </h2>
      <p className="sm:col-span-2 text-sm text-muted">
        {seed.card_name}
        {!isEdit
          ? " — 引落日・金額を実際に合わせて保存すると、この月は確定扱いになります。"
          : " — 月によって日付や金額が違う場合はここで直せます。"}
      </p>
      {editing?.payment_id ? (
        <input type="hidden" name="id" value={editing.payment_id} />
      ) : null}
      <input type="hidden" name="credit_card_id" value={seed.credit_card_id} />
      <label className="grid gap-1 text-sm">
        <span className="text-muted">引落日</span>
        <input
          name="payment_date"
          type="date"
          required
          defaultValue={seed.payment_date}
          className="rounded-md border border-line bg-white px-3 py-2"
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-muted">一回払い（円）</span>
        <input
          name="one_time_amount"
          type="number"
          min={0}
          defaultValue={seed.one_time_amount}
          className="rounded-md border border-line bg-white px-3 py-2"
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-muted">分割払い（円）</span>
        <input
          name="installment_amount"
          type="number"
          min={0}
          defaultValue={seed.installment_amount}
          className="rounded-md border border-line bg-white px-3 py-2"
        />
      </label>
      <label className="sm:col-span-2 grid gap-1 text-sm">
        <span className="text-muted">メモ</span>
        <input name="note" className="rounded-md border border-line bg-white px-3 py-2" />
      </label>
      <div className="sm:col-span-2 flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-accent px-4 py-2 text-white hover:bg-accent-deep disabled:opacity-60"
        >
          {pending ? "保存中…" : isEdit ? "更新" : "実額で確定"}
        </button>
        <Link
          href={basePath}
          className="rounded-md border border-line px-4 py-2 text-sm text-muted"
        >
          キャンセル
        </Link>
      </div>
      {error ? <p className="sm:col-span-2 text-sm text-expense">{error}</p> : null}
    </form>
  );
}

function ScheduleList({
  schedule,
  cards,
  filterCardId,
  basePath,
}: {
  schedule: CardScheduleItem[];
  cards: CreditCard[];
  filterCardId: string | null;
  basePath: string;
}) {
  const filtered = filterCardId
    ? schedule.filter((s) => s.credit_card_id === filterCardId)
    : schedule;
  const filterName = filterCardId
    ? (cards.find((c) => c.id === filterCardId)?.name ?? null)
    : null;

  if (schedule.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line bg-white/50 px-4 py-8 text-center text-sm text-muted">
        表示する引落予定がありません。カードに予定額を登録してください。
      </p>
    );
  }

  return (
    <section className="grid gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold">引落スケジュール（予定＋確定）</h2>
          <p className="mt-0.5 text-xs text-muted">
            {filterName
              ? `${filterName} のみ表示 · ${filtered.length} 件`
              : `日付順 · ${filtered.length} 件`}
          </p>
        </div>
      </div>
      {cards.length > 1 ? (
        <div className="flex flex-wrap gap-1">
          <Link
            href={withQuery(basePath, {
              card: null,
              editCard: null,
              confirmCard: null,
              confirmDate: null,
              editPayment: null,
            })}
            className={`rounded-md px-2.5 py-1 text-xs ${
              !filterCardId
                ? "bg-accent text-white"
                : "border border-line bg-white/80 text-muted"
            }`}
          >
            すべて
          </Link>
          {cards.map((c) => {
            const active = filterCardId === c.id;
            return (
              <Link
                key={c.id}
                href={withQuery(basePath, {
                  card: c.id,
                  editCard: null,
                  confirmCard: null,
                  confirmDate: null,
                  editPayment: null,
                })}
                className={`rounded-md px-2.5 py-1 text-xs ${
                  active
                    ? "bg-accent text-white"
                    : "border border-line bg-white/80 text-muted"
                }`}
              >
                {c.name}
              </Link>
            );
          })}
        </div>
      ) : null}
      {filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line bg-white/50 px-4 py-8 text-center text-sm text-muted">
          このカードの引落予定はありません
        </p>
      ) : (
        <ul className="divide-y divide-line/70 overflow-hidden rounded-xl border border-line/80 bg-surface">
          {filtered.map((s) => {
            const total = s.one_time_amount + s.installment_amount;
            return (
              <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">
                      {filterCardId ? s.payment_date : `${s.card_name} · ${s.payment_date}`}
                    </p>
                    {s.isProjected ? (
                      <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                        予定
                      </span>
                    ) : (
                      <span className="rounded bg-ink/5 px-1.5 py-0.5 text-[10px] font-medium text-muted">
                        確定
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted">
                    一回 {formatYen(s.one_time_amount)} + 分割{" "}
                    {formatYen(s.installment_amount)}
                  </p>
                </div>
                <p className="tabular-nums text-sm font-medium text-expense">
                  {formatYen(total)}
                </p>
                {s.isProjected ? (
                  <Link
                    href={withQuery(basePath, {
                      card: filterCardId,
                      confirmCard: s.credit_card_id,
                      confirmDate: s.payment_date,
                      editCard: null,
                      editPayment: null,
                    })}
                    className="text-xs text-accent hover:underline"
                  >
                    実額を確定
                  </Link>
                ) : (
                  <>
                    <Link
                      href={withQuery(basePath, {
                        card: filterCardId,
                        editPayment: s.payment_id,
                        editCard: null,
                        confirmCard: null,
                        confirmDate: null,
                      })}
                      className="text-xs text-accent hover:underline"
                    >
                      編集
                    </Link>
                    <form action={deleteCardPayment}>
                      <input type="hidden" name="id" value={s.payment_id ?? ""} />
                      <button
                        type="submit"
                        className="text-xs text-muted hover:text-expense"
                      >
                        削除
                      </button>
                    </form>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
