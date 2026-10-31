"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { format } from "date-fns";
import {
  deleteDailySpendEntry,
  deleteScheduledRule,
  saveScheduledRule,
  updateScheduledOccurrenceAmount,
} from "@/app/actions";
import { EditPopover } from "@/components/edit-popover";
import { todayKeyInTimeZone } from "@/lib/dates";
import { formatYen } from "@/lib/money";
import { ruleOccursInMonth } from "@/lib/schedule-dates";
import type {
  AssetAccount,
  DailySpendCategory,
  DailySpendEntry,
  ScheduleKind,
  ScheduledRule,
} from "@/lib/types";
import {
  FIXED_COST_CATEGORY_NAME,
  isConfidentialCategory,
  isFixedCostCategory,
  scheduleKindLabel,
} from "@/lib/types";

const KIND_ORDER: ScheduleKind[] = ["recurring", "card", "loan"];

type Props = {
  rules: ScheduledRule[];
  accounts: AssetAccount[];
  categories: DailySpendCategory[];
  loadError: string | null;
  /** 指定した月に発生するものだけ一覧する。未指定なら全体 */
  monthKey?: string;
  /** 取引から作られた日々の記録 */
  occurrences?: DailySpendEntry[];
  /** ポップアップ内。見出しを短くし、月の一覧を開いた状態にする */
  variant?: "page" | "dialog";
};

export function ScheduledRulesPanel({
  rules,
  accounts,
  categories,
  loadError,
  monthKey,
  occurrences = [],
  variant = "page",
}: Props) {
  const expenseCategories = categories.filter(
    (c) => !isConfidentialCategory(c.name),
  );
  const visible = monthKey
    ? rules.filter((rule) => ruleOccursInMonth(rule, monthKey))
    : rules;
  const fixed =
    categories.find((c) => isFixedCostCategory(c.name)) ??
    categories.find((c) => c.name === FIXED_COST_CATEGORY_NAME);

  const dialog = variant === "dialog";

  return (
    <section className={dialog ? "grid gap-3" : "grid gap-3 rounded-xl border border-line/80 bg-surface p-4"}>
      {dialog ? null : (
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold">取引</h2>
            <p className="mt-1 text-xs text-muted">
              毎月、または何か月おきかに同じ入出金を登録します。一覧は発生した日ごとで、すべてと種別（定期・カード・ローン）で絞れます。近い月の金額がわかったときは、その日の行だけ直せます。先の月は登録したおおよその金額のままです。期間は 2026/10/1～ のように出します。
            </p>
          </div>
          <NewScheduledRuleButton
            accounts={accounts}
            categories={categories}
            defaultCategoryId={fixed?.id ?? expenseCategories[0]?.id ?? ""}
          />
        </div>
      )}
      {loadError ? <p className="text-sm text-expense">{loadError}</p> : null}
      {monthKey ? (
        <p className="text-xs text-muted">
          この一覧は表示中の月に発生するものだけです。{" "}
          <Link href="/schedules" className="text-accent underline-offset-2 hover:underline">
            取引登録で全体を見る
          </Link>
        </p>
      ) : null}
      <OccurrenceBrowser
        rules={monthKey ? visible : rules}
        occurrences={occurrences}
        accounts={accounts}
        categories={categories}
        monthKey={monthKey}
        expanded={dialog}
      />
    </section>
  );
}

export function NewScheduledRuleButton({
  accounts,
  categories,
  defaultCategoryId,
  buttonLabel = "取引を追加",
  buttonClassName,
}: {
  accounts: AssetAccount[];
  categories: DailySpendCategory[];
  defaultCategoryId?: string;
  buttonLabel?: string;
  buttonClassName?: string;
}) {
  const expenseCategories = categories.filter(
    (c) => !isConfidentialCategory(c.name),
  );
  const fixed =
    categories.find((c) => isFixedCostCategory(c.name)) ??
    categories.find((c) => c.name === FIXED_COST_CATEGORY_NAME);
  return (
    <EditPopover buttonLabel={buttonLabel} title="取引を追加" buttonClassName={buttonClassName}>
      <RuleForm
        accounts={accounts}
        categories={categories}
        defaultCategoryId={defaultCategoryId ?? fixed?.id ?? expenseCategories[0]?.id ?? ""}
      />
    </EditPopover>
  );
}

function occurrenceMark(date: string): string {
  const [year, month, day] = date.slice(0, 10).split("-");
  const mark = `${Number(month)}/${Number(day)}分`;
  return year === todayKeyInTimeZone().slice(0, 4) ? mark : `${year}/${mark}`;
}

function ruleScheduleText(rule: ScheduledRule): string {
  return rule.interval_months === 1
    ? `毎月${rule.day_of_month}日`
    : `${rule.interval_months}か月おき ${rule.day_of_month}日`;
}

function slashDate(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split("-");
  return `${year}/${Number(month)}/${Number(day)}`;
}

function rulePeriodText(rule: ScheduledRule): string {
  const start = slashDate(rule.start_date);
  return rule.end_date ? `${start}～${slashDate(rule.end_date)}` : `${start}～`;
}

function OccurrenceBrowser({
  rules,
  occurrences,
  accounts,
  categories,
  monthKey,
  expanded = false,
}: {
  rules: ScheduledRule[];
  occurrences: DailySpendEntry[];
  accounts: AssetAccount[];
  categories: DailySpendCategory[];
  monthKey?: string;
  expanded?: boolean;
}) {
  const [selectedKind, setSelectedKind] = useState<"all" | ScheduleKind>("all");
  const ruleById = useMemo(
    () => new Map(rules.map((rule) => [rule.id, rule])),
    [rules],
  );
  const kinds = KIND_ORDER.filter((kind) =>
    rules.some((rule) => rule.schedule_kind === kind),
  );
  const selectedRules = useMemo(() => {
    if (selectedKind === "all") return [];
    return rules
      .filter((rule) => rule.schedule_kind === selectedKind)
      .sort(
        (a, b) =>
          a.name.localeCompare(b.name, "ja") || a.created_at.localeCompare(b.created_at),
      );
  }, [rules, selectedKind]);
  const selectedRuleIds = useMemo(
    () => new Set(selectedRules.map((rule) => rule.id)),
    [selectedRules],
  );
  const scoped = occurrences.filter((row) => {
    if (!row.scheduled_rule_id) return false;
    if (monthKey && !row.date.startsWith(monthKey)) return false;
    return true;
  });
  const inScope = scoped.filter(
    (row) =>
      selectedKind === "all" ||
      (row.scheduled_rule_id != null && selectedRuleIds.has(row.scheduled_rule_id)),
  );
  const sorted = [...inScope].sort(
    (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
  );
  const seen = new Map<string, number>();
  for (const row of scoped) {
    const rule = row.scheduled_rule_id
      ? ruleById.get(row.scheduled_rule_id)
      : undefined;
    const key = duplicateKey(row, rule);
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  const duplicateKeys = new Set(
    [...seen.entries()].filter(([, count]) => count > 1).map(([key]) => key),
  );
  const list = (
    <>
      <div className="flex flex-wrap gap-1.5 px-3 py-2.5">
        <FilterChip active={selectedKind === "all"} onClick={() => setSelectedKind("all")}>
          すべて
        </FilterChip>
        {kinds.map((kind) => (
          <FilterChip
            key={kind}
            active={selectedKind === kind}
            onClick={() => setSelectedKind(kind)}
          >
            {scheduleKindLabel(kind)}
          </FilterChip>
        ))}
      </div>
      {selectedRules.length > 0 ? (
        <ul className="divide-y divide-line/70 border-t border-line/70">
          {selectedRules.map((rule) => (
            <li key={rule.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <p className="min-w-0 flex-1 text-xs text-muted">
                <span className="font-medium text-ink">{rule.name}</span>
                {` · ${ruleScheduleText(rule)} · ${formatYen(rule.amount)} · ${rulePeriodText(rule)}`}
              </p>
              <EditPopover buttonLabel="登録を編集" title="取引を編集">
                <RuleForm accounts={accounts} categories={categories} rule={rule} />
              </EditPopover>
              <DeleteRuleButton id={rule.id} label="登録を削除" />
            </li>
          ))}
        </ul>
      ) : null}
      {sorted.length === 0 ? (
        <p className="border-t border-line/70 px-3 py-4 text-sm text-muted">
          {selectedKind === "all"
            ? "この範囲の発生はまだありません。"
            : "この種別の発生はまだありません。"}
        </p>
      ) : (
        <ul className="divide-y divide-line/70 border-t border-line/70">
          {sorted.map((row) => {
            const rule = row.scheduled_rule_id
              ? ruleById.get(row.scheduled_rule_id)
              : undefined;
            const account = accounts.find(
              (item) => item.id === (row.asset_account_id ?? rule?.asset_account_id),
            );
            const income = (row.kind ?? rule?.flow) === "income";
            const adjusted =
              Boolean(row.amount_locked) ||
              (rule != null && Number(row.amount) !== Number(rule.amount));
            return (
              <li key={row.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {rule?.name ?? row.memo ?? "取引"}
                    <span className="ml-2 text-xs text-muted">
                      {income ? "収入" : "支出"}
                    </span>
                  </p>
                  <p className="text-xs text-muted">
                    {rule ? ruleScheduleText(rule) : "単発"}
                    {account ? ` · ${account.name}` : ""}
                    <span className="ml-1 font-medium text-ink">
                      {occurrenceMark(row.date)}
                    </span>
                    {adjusted ? (
                      <span className="ml-2 text-accent">この月だけ変更</span>
                    ) : null}
                    {duplicateKeys.has(duplicateKey(row, rule)) ? (
                      <span className="ml-2 text-expense">同じ日に重複</span>
                    ) : null}
                  </p>
                </div>
                <p
                  className={`text-sm font-semibold tabular-nums ${
                    income ? "text-income" : "text-expense"
                  }`}
                >
                  {formatYen(row.amount)}
                </p>
                <EditPopover buttonLabel="この分を編集" title="この分の日付と金額">
                  <OccurrenceAmountForm
                    entryId={row.id}
                    amount={row.amount}
                    date={row.date}
                    ruleAmount={rule?.amount ?? null}
                    label={occurrenceMark(row.date)}
                  />
                </EditPopover>
                <form action={deleteDailySpendEntry}>
                  <input type="hidden" name="id" value={row.id} />
                  <button
                    type="submit"
                    className="text-xs text-muted hover:text-expense"
                  >
                    この分を削除
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );

  if (monthKey && !expanded) {
    return (
      <details className="rounded-lg border border-line/70 bg-white/60">
        <summary className="cursor-pointer px-3 py-2.5 text-sm font-medium">
          この月の発生（{occurrences.filter((row) => row.scheduled_rule_id && row.date.startsWith(monthKey)).length}件）
        </summary>
        {list}
      </details>
    );
  }

  return (
    <div className="rounded-lg border border-line/70 bg-white/60">
      <p className="border-b border-line/70 px-3 py-2.5 text-sm font-medium">
        発生一覧（{sorted.length}件）
      </p>
      {list}
    </div>
  );
}

function OccurrenceAmountForm({
  entryId,
  amount,
  date,
  ruleAmount,
  label,
}: {
  entryId: string;
  amount: number;
  date: string;
  ruleAmount: number | null;
  label: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="grid gap-2"
      action={(fd) => {
        startTransition(async () => {
          const res = await updateScheduledOccurrenceAmount(fd);
          setError(res && "error" in res ? res.error ?? null : null);
        });
      }}
    >
      <input type="hidden" name="id" value={entryId} />
      <p className="text-xs text-muted">
        {label} の日付と金額を変えます。日付を移すと、元の日はもう作られません。毎月の登録
        {ruleAmount != null ? `（${formatYen(ruleAmount)}）` : ""}
        と、まだ直していない先の月はそのままです。
      </p>
      <label className="grid gap-1 text-sm">
        <span className="text-muted">日付</span>
        <input
          name="date"
          type="date"
          required
          defaultValue={date.slice(0, 10)}
          className="w-fit rounded-md border border-line bg-white px-3 py-2"
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-muted">この分の金額（円）</span>
        <input
          name="amount"
          type="number"
          min={1}
          required
          defaultValue={amount}
          className="rounded-md border border-line bg-white px-3 py-2"
        />
      </label>
      {error ? <p className="text-sm text-expense">{error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-accent px-3 py-2 text-sm text-white disabled:opacity-60"
      >
        {pending ? "保存しています…" : "この分を保存"}
      </button>
    </form>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-2.5 py-1 text-xs ${
        active
          ? "bg-accent text-white"
          : "border border-line bg-white text-muted hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function endOfMonthKey(iso: string): string {
  const month = iso.slice(0, 7);
  const [year, monthNumber] = month.split("-").map(Number);
  if (!year || !monthNumber) return iso;
  const last = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return `${month}-${String(last).padStart(2, "0")}`;
}

function duplicateKey(
  row: DailySpendEntry,
  rule: ScheduledRule | undefined,
): string {
  const kind = row.kind ?? rule?.flow ?? "expense";
  return `${row.date}|${(row.memo ?? rule?.name ?? "").trim()}|${kind}|${row.amount}`;
}

function DeleteRuleButton({
  id,
  label = "削除",
}: {
  id: string;
  label?: string;
}) {
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
        {label}
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
  const [startDate, setStartDate] = useState(rule?.start_date ?? today);
  const [endDate, setEndDate] = useState(rule?.end_date ?? "");
  const sameMonth =
    Boolean(rule?.end_date) && rule?.end_date?.slice(0, 7) === rule?.start_date.slice(0, 7);
  const [thisMonthOnly, setThisMonthOnly] = useState(sameMonth);
  const activeAccounts = accounts.filter((a) => !a.archived);
  const monthOnlyEnd = endOfMonthKey(startDate);

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
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
            className="rounded-md border border-line bg-white px-3 py-2"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-muted">終了日（任意）</span>
          <input
            name="end_date"
            type="date"
            value={thisMonthOnly ? monthOnlyEnd : endDate}
            onChange={(event) => setEndDate(event.target.value)}
            readOnly={thisMonthOnly}
            className="rounded-md border border-line bg-white px-3 py-2 read-only:bg-white/70"
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
            {categories
              .filter(
                (category) =>
                  !isConfidentialCategory(category.name) ||
                  category.id === rule?.category_id,
              )
              .map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={thisMonthOnly}
          onChange={(event) => setThisMonthOnly(event.target.checked)}
        />
        <span>
          この月だけ
          <span className="mt-0.5 block text-[11px] text-muted">
            開始月の末日で終わります。先の月には入りません。
          </span>
        </span>
      </label>
      <p className="text-[11px] text-muted">
        {thisMonthOnly
          ? "開始月のその日だけが記録になります。"
          : "今月以降、約24か月分がその日の記録になります。手で直した月は、この金額を変えても上書きしません。"}
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
