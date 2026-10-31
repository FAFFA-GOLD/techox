"use client";

import { useState, useTransition } from "react";
import { format } from "date-fns";
import { deleteScheduledRule, saveScheduledRule } from "@/app/actions";
import { EditPopover } from "@/components/edit-popover";
import { formatYen } from "@/lib/money";
import type { AssetAccount, DailySpendCategory, ScheduledRule } from "@/lib/types";
import {
  FIXED_COST_CATEGORY_NAME,
  isFixedCostCategory,
  scheduleKindLabel,
} from "@/lib/types";

type Props = {
  rules: ScheduledRule[];
  accounts: AssetAccount[];
  categories: DailySpendCategory[];
  loadError: string | null;
};

export function ScheduledRulesPanel({
  rules,
  accounts,
  categories,
  loadError,
}: Props) {
  const expenseCategories = categories;
  const fixed =
    categories.find((c) => isFixedCostCategory(c.name)) ??
    categories.find((c) => c.name === FIXED_COST_CATEGORY_NAME);

  return (
    <section className="grid gap-3 rounded-xl border border-line/80 bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold">取引</h2>
          <p className="mt-1 text-xs text-muted">
            毎月、または何か月おきかに同じ入出金を登録します。保存した額が、その日の記録として先の月にも入ります。月によって額が変わるときは、カレンダーのその日を編集します。
          </p>
        </div>
        <EditPopover buttonLabel="取引を追加" title="取引を追加">
          <RuleForm
            accounts={accounts}
            categories={expenseCategories}
            defaultCategoryId={fixed?.id ?? categories[0]?.id ?? ""}
          />
        </EditPopover>
      </div>
      {loadError ? <p className="text-sm text-expense">{loadError}</p> : null}
      {rules.length === 0 ? (
        <p className="text-sm text-muted">登録された取引はまだありません。</p>
      ) : (
        <details className="rounded-lg border border-line/70 bg-white/60">
          <summary className="cursor-pointer px-3 py-2.5 text-sm font-medium">
            登録一覧（{rules.length}件）
          </summary>
          <ul className="divide-y divide-line/70 border-t border-line/70">
          {rules.map((rule) => {
            const account = accounts.find((a) => a.id === rule.asset_account_id);
            return (
              <li key={rule.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {rule.name}
                    <span className="ml-2 text-xs text-muted">
                      {scheduleKindLabel(rule.schedule_kind)}
                      {rule.flow === "income" ? " · 収入" : " · 支出"}
                    </span>
                  </p>
                  <p className="text-xs text-muted">
                    {rule.interval_months === 1
                      ? `毎月${rule.day_of_month}日`
                      : `${rule.interval_months}か月おき ${rule.day_of_month}日`}
                    {account ? ` · ${account.name}` : ""}
                    {rule.end_date ? ` · ${rule.end_date}まで` : ""}
                  </p>
                </div>
                <p
                  className={`text-sm font-semibold tabular-nums ${
                    rule.flow === "income" ? "text-income" : "text-expense"
                  }`}
                >
                  {formatYen(rule.amount)}
                </p>
                <EditPopover buttonLabel="編集" title="取引を編集">
                  <RuleForm
                    accounts={accounts}
                    categories={expenseCategories}
                    rule={rule}
                  />
                </EditPopover>
                <DeleteRuleButton id={rule.id} />
              </li>
            );
          })}
          </ul>
        </details>
      )}
    </section>
  );
}

function DeleteRuleButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <form
      action={(fd) => {
        startTransition(async () => {
          await deleteScheduledRule(fd);
        });
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending}
        className="text-xs text-muted hover:text-expense disabled:opacity-60"
      >
        削除
      </button>
    </form>
  );
}

function RuleForm({
  accounts,
  categories,
  rule,
  defaultCategoryId,
}: {
  accounts: AssetAccount[];
  categories: DailySpendCategory[];
  rule?: ScheduledRule;
  defaultCategoryId?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [flow, setFlow] = useState(rule?.flow ?? "expense");
  const today = format(new Date(), "yyyy-MM-dd");
  const activeAccounts = accounts.filter((a) => !a.archived);

  return (
    <form
      className="grid gap-2"
      action={(fd) => {
        startTransition(async () => {
          const res = await saveScheduledRule(fd);
          setError(res?.error ?? null);
        });
      }}
    >
      {rule ? <input type="hidden" name="id" value={rule.id} /> : null}
      <label className="grid gap-1 text-sm">
        <span className="text-muted">名前</span>
        <input
          name="name"
          required
          defaultValue={rule?.name ?? ""}
          className="rounded-md border border-line bg-white px-3 py-2"
          placeholder="家賃、給与、カード"
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="grid gap-1 text-sm">
          <span className="text-muted">種別</span>
          <select
            name="schedule_kind"
            defaultValue={rule?.schedule_kind ?? "recurring"}
            className="rounded-md border border-line bg-white px-3 py-2"
          >
            <option value="recurring">定期</option>
            <option value="card">カード</option>
            <option value="loan">ローン</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-muted">入出金</span>
          <select
            name="flow"
            value={flow}
            onChange={(event) => setFlow(event.target.value as "expense" | "income")}
            className="rounded-md border border-line bg-white px-3 py-2"
          >
            <option value="expense">支出</option>
            <option value="income">収入</option>
          </select>
        </label>
      </div>
      <label className="grid gap-1 text-sm">
        <span className="text-muted">金額（円）</span>
        <input
          name="amount"
          type="number"
          min={1}
          required
          defaultValue={rule?.amount ?? ""}
          className="rounded-md border border-line bg-white px-3 py-2"
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="grid gap-1 text-sm">
          <span className="text-muted">日</span>
          <input
            name="day_of_month"
            type="number"
            min={1}
            max={31}
            required
            defaultValue={rule?.day_of_month ?? 1}
            className="rounded-md border border-line bg-white px-3 py-2"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-muted">間隔（か月）</span>
          <input
            name="interval_months"
            type="number"
            min={1}
            max={24}
            required
            defaultValue={rule?.interval_months ?? 1}
            className="rounded-md border border-line bg-white px-3 py-2"
          />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="grid gap-1 text-sm">
          <span className="text-muted">開始日</span>
          <input
            name="start_date"
            type="date"
            required
            defaultValue={rule?.start_date ?? today}
            className="rounded-md border border-line bg-white px-3 py-2"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-muted">終了日（任意）</span>
          <input
            name="end_date"
            type="date"
            defaultValue={rule?.end_date ?? ""}
            className="rounded-md border border-line bg-white px-3 py-2"
          />
        </label>
      </div>
      <label className="grid gap-1 text-sm">
        <span className="text-muted">口座</span>
        <select
          name="asset_account_id"
          defaultValue={rule?.asset_account_id ?? activeAccounts.find((a) => a.is_main)?.id ?? activeAccounts[0]?.id ?? ""}
          className="rounded-md border border-line bg-white px-3 py-2"
        >
          {activeAccounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
      </label>
      {flow === "expense" ? (
        <label className="grid gap-1 text-sm">
          <span className="text-muted">毎日の支出の用途</span>
          <select
            name="category_id"
            defaultValue={rule?.category_id ?? defaultCategoryId ?? ""}
            className="rounded-md border border-line bg-white px-3 py-2"
          >
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <p className="text-[11px] text-muted">
        今月以降、約24か月分がその日の記録になります。手で直した月は、この金額を変えても上書きしません。
      </p>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-accent px-3 py-2 text-sm text-white disabled:opacity-60"
      >
        {pending ? "保存中…" : "保存して日付へ入れる"}
      </button>
      {error ? <p className="text-sm text-expense">{error}</p> : null}
    </form>
  );
}
