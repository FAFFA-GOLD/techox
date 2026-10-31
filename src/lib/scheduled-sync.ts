import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { todayKeyInTimeZone } from "@/lib/dates";
import {
  scheduleOccurrenceDates,
  scheduleWindowStart,
} from "@/lib/schedule-dates";
import {
  FIXED_COST_CATEGORY_NAME,
  type AssetAccount,
  type DailySpendCategory,
  type ScheduledRule,
} from "@/lib/types";

type Db = SupabaseClient;

/** 画面の「今日」は日本時間。Vercel の UTC で月がずれないようにする。 */
function appToday(): Date {
  const [year, month, day] = todayKeyInTimeZone().split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

function missingTable(message: string): boolean {
  return (
    message.includes("scheduled_rules") ||
    message.includes("scheduled_rule_skips") ||
    message.includes("schedules_migrated") ||
    message.includes("amount_locked") ||
    message.includes("schema cache")
  );
}

export function migrationHint(message: string): string | null {
  if (!missingTable(message)) return null;
  return "取引には supabase/migrations/020_scheduled_rules.sql の実行が必要です";
}

export async function syncScheduledRule(
  supabase: Db,
  userId: string,
  rule: ScheduledRule,
): Promise<{ error?: string }> {
  const fromMonth = scheduleWindowStart(rule.start_date, appToday());
  const dates = scheduleOccurrenceDates(rule, fromMonth);
  const wanted = new Set(dates);

  const { data: skips, error: skipErr } = await supabase
    .from("scheduled_rule_skips")
    .select("date")
    .eq("scheduled_rule_id", rule.id);
  if (skipErr) return { error: skipErr.message };
  const skipSet = new Set((skips ?? []).map((s) => String(s.date)));

  const { data: existing, error: exErr } = await supabase
    .from("daily_spend_entries")
    .select("id, date, amount_locked")
    .eq("scheduled_rule_id", rule.id)
    .gte("date", `${fromMonth}-01`);
  if (exErr) return { error: exErr.message };

  const byDate = new Map(
    (existing ?? []).map((e) => [String(e.date), e as { id: string; date: string; amount_locked: boolean }]),
  );

  for (const row of byDate.values()) {
    if (wanted.has(row.date) || row.amount_locked) continue;
    const { error } = await supabase
      .from("daily_spend_entries")
      .delete()
      .eq("id", row.id);
    if (error) return { error: error.message };
  }

  for (const date of dates) {
    if (skipSet.has(date)) continue;
    const row = byDate.get(date);
    if (!row) {
      const { error } = await supabase.from("daily_spend_entries").insert({
        user_id: userId,
        category_id: rule.flow === "income" ? null : rule.category_id,
        date,
        amount: rule.amount,
        points_amount: 0,
        memo: rule.name,
        kind: rule.flow,
        asset_account_id: rule.asset_account_id,
        scheduled_rule_id: rule.id,
        amount_locked: false,
      });
      if (error) return { error: error.message };
      continue;
    }
    if (row.amount_locked) continue;
    const { error } = await supabase
      .from("daily_spend_entries")
      .update({
        category_id: rule.flow === "income" ? null : rule.category_id,
        amount: rule.amount,
        memo: rule.name,
        kind: rule.flow,
        asset_account_id: rule.asset_account_id,
      })
      .eq("id", row.id);
    if (error) return { error: error.message };
  }

  return {};
}

async function fetchPages<T>(
  load: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<{ rows: T[]; error?: string }> {
  const pageSize = 1000;
  const rows: T[] = [];
  for (let from = 0; from < 20000; from += pageSize) {
    const { data, error } = await load(from, from + pageSize - 1);
    if (error) return { rows, error: error.message };
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }
  return { rows };
}

/**
 * ページを開くたびに既存行を書き直すと、取引の件数だけ往復して画面が落ちる。
 * ここは「まだ無い日」だけまとめて足す。金額の更新と削除は取引の保存時に行う。
 */
async function ensureFutureOccurrences(
  supabase: Db,
  userId: string,
): Promise<{ error?: string }> {
  const { data, error } = await supabase
    .from("scheduled_rules")
    .select("*")
    .eq("user_id", userId);
  if (error) return { error: error.message };
  const rules = (data ?? []) as ScheduledRule[];
  if (rules.length === 0) return {};

  const today = appToday();
  let earliest = "9999-99";
  const datesByRule = new Map<string, string[]>();
  for (const rule of rules) {
    const fromMonth = scheduleWindowStart(rule.start_date, today);
    if (fromMonth < earliest) earliest = fromMonth;
    datesByRule.set(rule.id, scheduleOccurrenceDates(rule, fromMonth));
  }

  const existing = await fetchPages<{ scheduled_rule_id: string; date: string }>(
    (from, to) =>
      supabase
        .from("daily_spend_entries")
        .select("scheduled_rule_id, date")
        .eq("user_id", userId)
        .not("scheduled_rule_id", "is", null)
        .gte("date", `${earliest}-01`)
        .range(from, to),
  );
  if (existing.error) return { error: existing.error };

  const skips = await fetchPages<{ scheduled_rule_id: string; date: string }>(
    (from, to) =>
      supabase
        .from("scheduled_rule_skips")
        .select("scheduled_rule_id, date")
        .eq("user_id", userId)
        .range(from, to),
  );
  if (skips.error) return { error: skips.error };

  const have = new Set(
    existing.rows.map(
      (row) => `${row.scheduled_rule_id}|${String(row.date).slice(0, 10)}`,
    ),
  );
  const skipSet = new Set(
    skips.rows.map(
      (row) => `${row.scheduled_rule_id}|${String(row.date).slice(0, 10)}`,
    ),
  );

  const inserts: {
    user_id: string;
    category_id: string | null;
    date: string;
    amount: number;
    points_amount: number;
    memo: string;
    kind: ScheduledRule["flow"];
    asset_account_id: string | null;
    scheduled_rule_id: string;
    amount_locked: boolean;
  }[] = [];
  for (const rule of rules) {
    for (const date of datesByRule.get(rule.id) ?? []) {
      const key = `${rule.id}|${date}`;
      if (skipSet.has(key) || have.has(key)) continue;
      inserts.push({
        user_id: userId,
        category_id: rule.flow === "income" ? null : rule.category_id,
        date,
        amount: rule.amount,
        points_amount: 0,
        memo: rule.name,
        kind: rule.flow,
        asset_account_id: rule.asset_account_id,
        scheduled_rule_id: rule.id,
        amount_locked: false,
      });
    }
  }

  for (let i = 0; i < inserts.length; i += 200) {
    const chunk = inserts.slice(i, i + 200);
    const { error: insertError } = await supabase
      .from("daily_spend_entries")
      .insert(chunk);
    if (!insertError) continue;
    if (/duplicate|unique/i.test(insertError.message)) continue;
    return { error: insertError.message };
  }
  return {};
}

type LockedSeed = {
  date: string;
  amount: number;
  /** 予定日と違うとき、予定日は作らない */
  skipDate?: string;
};

async function insertLockedSeeds(
  supabase: Db,
  userId: string,
  rule: ScheduledRule,
  seeds: LockedSeed[],
): Promise<{ error?: string }> {
  for (const seed of seeds) {
    if (seed.skipDate && seed.skipDate !== seed.date) {
      const { error } = await supabase.from("scheduled_rule_skips").upsert(
        {
          user_id: userId,
          scheduled_rule_id: rule.id,
          date: seed.skipDate,
        },
        { onConflict: "scheduled_rule_id,date" },
      );
      if (error) return { error: error.message };
    }
    const { error } = await supabase.from("daily_spend_entries").insert({
      user_id: userId,
      category_id: rule.flow === "income" ? null : rule.category_id,
      date: seed.date,
      amount: seed.amount,
      points_amount: 0,
      memo: rule.name,
      kind: rule.flow,
      asset_account_id: rule.asset_account_id,
      scheduled_rule_id: rule.id,
      amount_locked: true,
    });
    if (error) return { error: error.message };
  }
  return {};
}

function monthKey(date: string): string {
  return date.slice(0, 7);
}

/**
 * 旧・定期/カード/ローンを取引へ一度だけ移し、今月以降の行を作る。
 * すでに移したユーザーは先の月の不足分だけ足す。
 */
export async function ensureSchedulesMigrated(
  supabase: Db,
  userId: string,
  categories: DailySpendCategory[],
  accounts: AssetAccount[],
): Promise<{ error?: string }> {
  const { data: settings, error: settingsError } = await supabase
    .from("user_settings")
    .select("schedules_migrated")
    .eq("user_id", userId)
    .maybeSingle();
  if (settingsError) return { error: settingsError.message };
  if (!settings) {
    const { error: insertSettingsError } = await supabase
      .from("user_settings")
      .upsert({ user_id: userId }, { onConflict: "user_id" });
    if (insertSettingsError) return { error: insertSettingsError.message };
  }
  if (settings?.schedules_migrated) {
    return ensureFutureOccurrences(supabase, userId);
  }

  const { count: existingRules, error: countError } = await supabase
    .from("scheduled_rules")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (countError) return { error: countError.message };
  if ((existingRules ?? 0) > 0) {
    const { error: flagError } = await supabase
      .from("user_settings")
      .update({ schedules_migrated: true })
      .eq("user_id", userId);
    if (flagError) return { error: flagError.message };
    return ensureFutureOccurrences(supabase, userId);
  }

  const fixed =
    categories.find((c) => c.name === FIXED_COST_CATEGORY_NAME) ?? null;
  const main = accounts.find((a) => a.is_main) ?? accounts[0] ?? null;
  const categoryIdByName = new Map(categories.map((c) => [c.name, c.id]));

  const [rulesRes, cardsRes, loansRes] = await Promise.all([
    supabase.from("recurring_rules").select("*, categories(name)").eq("user_id", userId),
    supabase.from("credit_cards").select("*").eq("user_id", userId),
    supabase.from("loans").select("*").eq("user_id", userId),
  ]);
  if (rulesRes.error) return { error: rulesRes.error.message };
  if (cardsRes.error) return { error: cardsRes.error.message };
  if (loansRes.error) return { error: loansRes.error.message };

  const fromMonth = todayKeyInTimeZone().slice(0, 7);
  const { data: confirmedTx } = await supabase
    .from("transactions")
    .select("recurring_rule_id, date, amount, kind")
    .eq("user_id", userId)
    .not("recurring_rule_id", "is", null)
    .gte("date", `${fromMonth}-01`);
  const { data: cardPays } = await supabase
    .from("credit_card_payments")
    .select("credit_card_id, payment_date, one_time_amount, installment_amount")
    .eq("user_id", userId)
    .gte("payment_date", `${fromMonth}-01`);
  const { data: loanPays } = await supabase
    .from("loan_payments")
    .select("loan_id, payment_date, principal_amount, interest_amount")
    .eq("user_id", userId)
    .gte("payment_date", `${fromMonth}-01`);

  async function createRule(input: {
    name: string;
    schedule_kind: ScheduledRule["schedule_kind"];
    flow: ScheduledRule["flow"];
    amount: number;
    day_of_month: number;
    start_date: string;
    end_date: string | null;
    asset_account_id: string | null;
    category_id: string | null;
    seeds: LockedSeed[];
  }): Promise<{ error?: string }> {
    if (input.amount <= 0) return {};
    const { data, error } = await supabase
      .from("scheduled_rules")
      .insert({
        user_id: userId,
        name: input.name,
        schedule_kind: input.schedule_kind,
        flow: input.flow,
        amount: input.amount,
        day_of_month: input.day_of_month,
        interval_months: 1,
        start_date: input.start_date,
        end_date: input.end_date,
        asset_account_id: input.asset_account_id ?? main?.id ?? null,
        category_id: input.flow === "income" ? null : input.category_id,
      })
      .select("*")
      .single();
    if (error || !data) return { error: error?.message ?? "取引を作れませんでした" };
    const rule = data as ScheduledRule;
    const seeded = await insertLockedSeeds(supabase, userId, rule, input.seeds);
    if (seeded.error) return seeded;
    return syncScheduledRule(supabase, userId, rule);
  }

  for (const rule of rulesRes.data ?? []) {
    const flow = rule.kind === "income" ? "income" : "expense";
    const catName = rule.categories?.name as string | undefined;
    const categoryId =
      flow === "income"
        ? null
        : (categoryIdByName.get(catName ?? "") ?? fixed?.id ?? null);
    const occurrences = scheduleOccurrenceDates(
      {
        day_of_month: rule.day_of_month,
        interval_months: 1,
        start_date: rule.start_date,
        end_date: rule.end_date,
      },
      scheduleWindowStart(rule.start_date),
    );
    const seeds: LockedSeed[] = [];
    for (const date of occurrences) {
      const tx = (confirmedTx ?? []).find(
        (t) =>
          t.recurring_rule_id === rule.id && monthKey(t.date) === monthKey(date),
      );
      if (!tx) continue;
      seeds.push({
        date: tx.date,
        amount: tx.amount,
        skipDate: tx.date === date ? undefined : date,
      });
    }
    const res = await createRule({
      name: rule.name,
      schedule_kind: "recurring",
      flow,
      amount: rule.amount,
      day_of_month: rule.day_of_month,
      start_date: rule.start_date,
      end_date: rule.end_date,
      asset_account_id: rule.asset_account_id,
      category_id: categoryId,
      seeds,
    });
    if (res.error) return res;
  }

  for (const card of cardsRes.data ?? []) {
    const amount =
      (card.default_one_time_amount ?? 0) + (card.default_installment_amount ?? 0);
    const draft = {
      day_of_month: card.payment_day,
      interval_months: 1,
      start_date: `${fromMonth}-01`,
      end_date: null as string | null,
    };
    const occurrences = scheduleOccurrenceDates(draft, fromMonth);
    const seeds: LockedSeed[] = [];
    for (const date of occurrences) {
      const pay = (cardPays ?? []).find(
        (p) =>
          p.credit_card_id === card.id &&
          monthKey(p.payment_date) === monthKey(date),
      );
      if (!pay) continue;
      const total = pay.one_time_amount + pay.installment_amount;
      if (total <= 0) continue;
      seeds.push({
        date: pay.payment_date,
        amount: total,
        skipDate: pay.payment_date === date ? undefined : date,
      });
    }
    const res = await createRule({
      name: card.name,
      schedule_kind: "card",
      flow: "expense",
      amount,
      day_of_month: card.payment_day,
      start_date: draft.start_date,
      end_date: null,
      asset_account_id: card.asset_account_id,
      category_id: fixed?.id ?? null,
      seeds,
    });
    if (res.error) return res;
  }

  for (const loan of loansRes.data ?? []) {
    const amount = (loan.principal_amount ?? 0) + (loan.interest_amount ?? 0);
    const draft = {
      day_of_month: loan.payment_day,
      interval_months: 1,
      start_date: loan.start_date > `${fromMonth}-01` ? loan.start_date : `${fromMonth}-01`,
      end_date: loan.end_date as string | null,
    };
    const occurrences = scheduleOccurrenceDates(draft, scheduleWindowStart(draft.start_date));
    const seeds: LockedSeed[] = [];
    for (const date of occurrences) {
      const pay = (loanPays ?? []).find(
        (p) => p.loan_id === loan.id && monthKey(p.payment_date) === monthKey(date),
      );
      if (!pay) continue;
      const total = pay.principal_amount + pay.interest_amount;
      if (total <= 0) continue;
      seeds.push({
        date: pay.payment_date,
        amount: total,
        skipDate: pay.payment_date === date ? undefined : date,
      });
    }
    const res = await createRule({
      name: loan.name,
      schedule_kind: "loan",
      flow: "expense",
      amount,
      day_of_month: loan.payment_day,
      start_date: draft.start_date,
      end_date: loan.end_date,
      asset_account_id: loan.asset_account_id,
      category_id: fixed?.id ?? null,
      seeds,
    });
    if (res.error) return res;
  }

  const { error: flagError } = await supabase
    .from("user_settings")
    .update({ schedules_migrated: true })
    .eq("user_id", userId);
  if (flagError) return { error: flagError.message };
  return {};
}
