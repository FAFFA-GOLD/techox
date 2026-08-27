"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { format } from "date-fns";
import {
  createLoan,
  deleteLoan,
  deleteLoanPayment,
  updateLoan,
  upsertLoanPayment,
} from "@/app/actions";
import { AssetAccountSelect } from "@/components/asset-account-select";
import { formatYen } from "@/lib/money";
import type { AssetAccount, Loan } from "@/lib/types";
import type { LoanScheduleItem } from "@/lib/schedules";

export type { LoanScheduleItem };

type Props = {
  loans: Loan[];
  accounts?: AssetAccount[];
  schedule: LoanScheduleItem[];
  editingId?: string | null;
  confirmLoanId?: string | null;
  confirmDate?: string | null;
  editPaymentId?: string | null;
  /** スケジュール絞り込み（ローン ID） */
  filterLoanId?: string | null;
  basePath?: string;
};

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

export function LoansClient({
  loans,
  accounts = [],
  schedule,
  editingId = null,
  confirmLoanId = null,
  confirmDate = null,
  editPaymentId = null,
  filterLoanId = null,
  basePath = "/loans",
}: Props) {
  const editing = loans.find((l) => l.id === editingId) ?? null;
  const confirmItem =
    confirmLoanId && confirmDate
      ? (schedule.find(
          (s) =>
            s.isProjected &&
            s.loan_id === confirmLoanId &&
            s.payment_date === confirmDate,
        ) ?? null)
      : null;
  const editingPayment = editPaymentId
    ? (schedule.find((s) => s.payment_id === editPaymentId) ?? null)
    : null;
  const activeFilter =
    filterLoanId && loans.some((l) => l.id === filterLoanId)
      ? filterLoanId
      : null;
  const scheduleBase = withQuery(basePath, {
    loan: activeFilter,
    edit: null,
    confirmLoan: null,
    confirmDate: null,
    editPayment: null,
  });

  return (
    <div className="grid gap-6">
      <LoanForm
        key={editing?.id ?? "new-loan"}
        editing={editing}
        accounts={accounts}
      />
      <LoanList
        loans={loans}
        basePath={basePath}
        filterLoanId={activeFilter}
      />
      <PaymentConfirmForm
        confirming={confirmItem}
        editing={editingPayment}
        basePath={scheduleBase}
      />
      <ScheduleList
        schedule={schedule}
        loans={loans}
        filterLoanId={activeFilter}
        basePath={basePath}
      />
    </div>
  );
}

function LoanForm({
  editing,
  accounts,
}: {
  editing: Loan | null;
  accounts: AssetAccount[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [useLastDay, setUseLastDay] = useState(
    editing ? editing.payment_day === 31 : false,
  );
  const isEdit = Boolean(editing);

  useEffect(() => {
    setUseLastDay(editing ? editing.payment_day === 31 : false);
    setError(null);
  }, [editing]);

  return (
    <form
      className="grid gap-3 rounded-xl border border-line/80 bg-surface p-4 sm:grid-cols-2"
      action={(fd) => {
        startTransition(async () => {
          const res = isEdit ? await updateLoan(fd) : await createLoan(fd);
          setError(res?.error ?? null);
        });
      }}
    >
      <h2 className="sm:col-span-2 text-lg font-bold">
        {isEdit ? "ローンを編集" : "ローンを追加"}
      </h2>
      <p className="sm:col-span-2 text-sm text-muted">
        予定の返済・利息で毎月展開されます。各月で「実額を確定」できます。
      </p>
      {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
      <label className="grid gap-1 text-sm sm:col-span-2">
        <span className="text-muted">名称</span>
        <input
          name="name"
          required
          defaultValue={editing?.name}
          className="rounded-md border border-line bg-white px-3 py-2"
          placeholder="住宅ローン"
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-muted">予定・返済額（円）</span>
        <input
          name="principal_amount"
          type="number"
          min={0}
          defaultValue={editing?.principal_amount ?? 0}
          className="rounded-md border border-line bg-white px-3 py-2"
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-muted">予定・利息（円）</span>
        <input
          name="interest_amount"
          type="number"
          min={0}
          defaultValue={editing?.interest_amount ?? 0}
          className="rounded-md border border-line bg-white px-3 py-2"
        />
      </label>
      <div className="grid gap-2 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="use_last_day"
            checked={useLastDay}
            onChange={(e) => setUseLastDay(e.target.checked)}
          />
          <span>支払日は月末</span>
        </label>
        {!useLastDay ? (
          <label className="grid gap-1">
            <span className="text-muted">支払日（1〜31）</span>
            <input
              name="payment_day"
              type="number"
              min={1}
              max={31}
              key={`payment-day-${editing?.id ?? "new"}-${useLastDay}`}
              defaultValue={editing?.payment_day ?? 27}
              className="rounded-md border border-line bg-white px-3 py-2"
            />
          </label>
        ) : (
          <input type="hidden" name="payment_day" value={31} />
        )}
      </div>
      <label className="grid gap-1 text-sm">
        <span className="text-muted">開始日</span>
        <input
          name="start_date"
          type="date"
          required
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
          defaultValue={editing?.end_date ?? ""}
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

function LoanList({
  loans,
  basePath,
  filterLoanId,
}: {
  loans: Loan[];
  basePath: string;
  filterLoanId: string | null;
}) {
  if (loans.length === 0) {
    return <p className="text-sm text-muted">ローンが未登録です。</p>;
  }

  return (
    <ul className="divide-y divide-line/70 overflow-hidden rounded-xl border border-line/80 bg-surface">
      {loans.map((l) => {
        const total = l.principal_amount + l.interest_amount;
        const filtered = filterLoanId === l.id;
        return (
          <li key={l.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{l.name}</p>
              <p className="text-xs text-muted">
                {l.payment_day === 31 ? "毎月月末" : `毎月${l.payment_day}日`} ·
                予定 {formatYen(total)} · {l.start_date} 〜 {l.end_date ?? "継続"}
              </p>
            </div>
            <Link
              href={withQuery(basePath, {
                loan: l.id,
                edit: null,
                confirmLoan: null,
                confirmDate: null,
                editPayment: null,
              })}
              className={`text-xs ${filtered ? "font-medium text-accent" : "text-muted hover:text-accent"}`}
            >
              {filtered ? "表示中" : "このローンだけ"}
            </Link>
            <Link
              href={withQuery(basePath, {
                edit: l.id,
                loan: filterLoanId,
                confirmLoan: null,
                confirmDate: null,
                editPayment: null,
              })}
              className="text-xs text-accent"
            >
              編集
            </Link>
            <form action={deleteLoan}>
              <input type="hidden" name="id" value={l.id} />
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
  confirming,
  editing,
  basePath,
}: {
  confirming: LoanScheduleItem | null;
  editing: LoanScheduleItem | null;
  basePath: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const seed = editing ?? confirming;
  if (!seed) return null;
  const isEdit = Boolean(editing);

  return (
    <form
      key={seed.id}
      className="grid gap-3 rounded-xl border border-accent/30 bg-surface p-4 sm:grid-cols-2"
      action={(fd) => {
        startTransition(async () => {
          const res = await upsertLoanPayment(fd);
          setError(res?.error ?? null);
          if (!res?.error) {
            router.push(basePath);
            router.refresh();
          }
        });
      }}
    >
      <h2 className="sm:col-span-2 text-lg font-bold">
        {isEdit ? "ローン支払を編集" : "ローン予定の実額を確定"}
      </h2>
      <p className="sm:col-span-2 text-sm text-muted">
        {seed.loan_name}
        {isEdit
          ? " — 月によって日付や金額が違う場合はここで直せます。"
          : " — 支払日・金額を実際に合わせて保存すると確定扱いになります。"}
      </p>
      {editing?.payment_id ? (
        <input type="hidden" name="id" value={editing.payment_id} />
      ) : null}
      <input type="hidden" name="loan_id" value={seed.loan_id} />
      <label className="grid gap-1 text-sm">
        <span className="text-muted">支払日</span>
        <input
          name="payment_date"
          type="date"
          required
          defaultValue={seed.payment_date}
          className="rounded-md border border-line bg-white px-3 py-2"
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-muted">返済額（円）</span>
        <input
          name="principal_amount"
          type="number"
          min={0}
          defaultValue={seed.principal_amount}
          className="rounded-md border border-line bg-white px-3 py-2"
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-muted">利息（円）</span>
        <input
          name="interest_amount"
          type="number"
          min={0}
          defaultValue={seed.interest_amount}
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
  loans,
  filterLoanId,
  basePath,
}: {
  schedule: LoanScheduleItem[];
  loans: Loan[];
  filterLoanId: string | null;
  basePath: string;
}) {
  const filtered = filterLoanId
    ? schedule.filter((s) => s.loan_id === filterLoanId)
    : schedule;
  const filterName = filterLoanId
    ? (loans.find((l) => l.id === filterLoanId)?.name ?? null)
    : null;

  if (schedule.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line bg-white/50 px-4 py-8 text-center text-sm text-muted">
        表示するローン予定がありません
      </p>
    );
  }

  return (
    <section className="grid gap-3">
      <div>
        <h2 className="text-lg font-bold">支払スケジュール（予定＋確定）</h2>
        <p className="mt-0.5 text-xs text-muted">
          {filterName
            ? `${filterName} のみ表示 · ${filtered.length} 件`
            : `日付順 · ${filtered.length} 件`}
        </p>
      </div>
      {loans.length > 1 ? (
        <div className="flex flex-wrap gap-1">
          <Link
            href={withQuery(basePath, {
              loan: null,
              edit: null,
              confirmLoan: null,
              confirmDate: null,
              editPayment: null,
            })}
            className={`rounded-md px-2.5 py-1 text-xs ${
              !filterLoanId
                ? "bg-accent text-white"
                : "border border-line bg-white/80 text-muted"
            }`}
          >
            すべて
          </Link>
          {loans.map((l) => {
            const active = filterLoanId === l.id;
            return (
              <Link
                key={l.id}
                href={withQuery(basePath, {
                  loan: l.id,
                  edit: null,
                  confirmLoan: null,
                  confirmDate: null,
                  editPayment: null,
                })}
                className={`rounded-md px-2.5 py-1 text-xs ${
                  active
                    ? "bg-accent text-white"
                    : "border border-line bg-white/80 text-muted"
                }`}
              >
                {l.name}
              </Link>
            );
          })}
        </div>
      ) : null}
      {filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line bg-white/50 px-4 py-8 text-center text-sm text-muted">
          このローンの支払予定はありません
        </p>
      ) : (
        <ul className="divide-y divide-line/70 overflow-hidden rounded-xl border border-line/80 bg-surface">
          {filtered.map((s) => {
            const total = s.principal_amount + s.interest_amount;
            return (
              <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">
                      {filterLoanId
                        ? s.payment_date
                        : `${s.loan_name} · ${s.payment_date}`}
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
                    返済 {formatYen(s.principal_amount)} + 利息{" "}
                    {formatYen(s.interest_amount)}
                  </p>
                </div>
                <p className="tabular-nums text-sm font-medium text-expense">
                  {formatYen(total)}
                </p>
                {s.isProjected ? (
                  <Link
                    href={withQuery(basePath, {
                      loan: filterLoanId,
                      confirmLoan: s.loan_id,
                      confirmDate: s.payment_date,
                      edit: null,
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
                        loan: filterLoanId,
                        editPayment: s.payment_id,
                        edit: null,
                        confirmLoan: null,
                        confirmDate: null,
                      })}
                      className="text-xs text-accent hover:underline"
                    >
                      編集
                    </Link>
                    <form action={deleteLoanPayment}>
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
