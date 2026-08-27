"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { PaydayType, TransactionKind } from "@/lib/types";

async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return "http://localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

function parseAmount(raw: FormDataEntryValue | null): number | null {
  if (raw == null) return null;
  const n = Number(String(raw).replace(/[,，]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

function parseAmountOrZero(raw: FormDataEntryValue | null): number | null {
  if (raw == null || String(raw).trim() === "") return 0;
  const n = Number(String(raw).replace(/[,，]/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

function clampDay(day: number): number {
  return Math.min(31, Math.max(1, day || 1));
}

function parseAssetAccountId(raw: FormDataEntryValue | null): string | null {
  const id = String(raw ?? "").trim();
  return id || null;
}

function revalidateMoney() {
  revalidatePath("/dashboard");
  revalidatePath("/transactions");
  revalidatePath("/categories");
  revalidatePath("/recurring");
  revalidatePath("/forecast");
  revalidatePath("/cards");
  revalidatePath("/loans");
  revalidatePath("/settings");
  revalidatePath("/calendar");
}

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };
  redirect("/dashboard");
}

export async function signUp(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) return { error: error.message };
  redirect("/dashboard");
}

export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "メールアドレスを入力してください" };

  const supabase = await createClient();
  const origin = await requestOrigin();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=${encodeURIComponent("/reset-password")}`,
  });
  if (error) return { error: error.message };
  return { ok: true as const };
}

export async function updatePassword(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < 6) {
    return { error: "パスワードは6文字以上にしてください" };
  }
  if (password !== confirm) {
    return { error: "確認用パスワードが一致しません" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "リセット用のセッションがありません。メールのリンクからやり直してください。" };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };
  redirect("/dashboard");
}

export async function createCategory(formData: FormData) {
  const { supabase, user } = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  const kind = String(formData.get("kind") ?? "expense") as TransactionKind;
  const color = String(formData.get("color") ?? "#0f766e");
  if (!name) return { error: "名前を入力してください" };

  const { error } = await supabase.from("categories").insert({
    user_id: user.id,
    name,
    kind,
    color,
  });
  if (error) return { error: error.message };
  revalidateMoney();
  return { ok: true };
}

export async function updateCategory(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const kind = String(formData.get("kind") ?? "expense") as TransactionKind;
  const color = String(formData.get("color") ?? "#0f766e");
  if (!id || !name) return { error: "入力内容を確認してください" };

  const { error } = await supabase
    .from("categories")
    .update({ name, kind, color })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidateMoney();
  return { ok: true };
}

export async function deleteCategory(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get("id") ?? "");
  await supabase.from("categories").delete().eq("id", id);
  revalidateMoney();
}

export async function createTransaction(formData: FormData) {
  const { supabase, user } = await requireUser();
  const date = String(formData.get("date") ?? "");
  const amount = parseAmount(formData.get("amount"));
  const kind = String(formData.get("kind") ?? "expense") as TransactionKind;
  const category_id = String(formData.get("category_id") ?? "") || null;
  const memo = String(formData.get("memo") ?? "").trim() || null;
  const recurring_rule_id =
    String(formData.get("recurring_rule_id") ?? "") || null;
  const asset_account_id = parseAssetAccountId(formData.get("asset_account_id"));

  if (!date || amount == null) {
    return { error: "日付と金額を正しく入力してください" };
  }

  const { error } = await supabase.from("transactions").insert({
    user_id: user.id,
    date,
    amount,
    kind,
    category_id,
    memo,
    recurring_rule_id,
    asset_account_id,
  });
  if (error) return { error: error.message };
  revalidateMoney();
  return { ok: true };
}

export async function updateTransaction(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get("id") ?? "");
  const date = String(formData.get("date") ?? "");
  const amount = parseAmount(formData.get("amount"));
  const kind = String(formData.get("kind") ?? "expense") as TransactionKind;
  const category_id = String(formData.get("category_id") ?? "") || null;
  const memo = String(formData.get("memo") ?? "").trim() || null;
  const recurring_rule_id =
    String(formData.get("recurring_rule_id") ?? "") || null;
  const asset_account_id = parseAssetAccountId(formData.get("asset_account_id"));

  if (!id || !date || amount == null) {
    return { error: "日付と金額を正しく入力してください" };
  }

  const { error } = await supabase
    .from("transactions")
    .update({
      date,
      amount,
      kind,
      category_id,
      memo,
      recurring_rule_id,
      asset_account_id,
    })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidateMoney();
  return { ok: true };
}

export async function deleteTransaction(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get("id") ?? "");
  await supabase.from("transactions").delete().eq("id", id);
  revalidateMoney();
}

export async function importTransactionsCsv(formData: FormData) {
  const { supabase, user } = await requireUser();
  const monthKey = String(formData.get("month") ?? "").trim();
  const file = formData.get("file");

  if (!/^\d{4}-\d{2}$/.test(monthKey)) {
    return { error: "対象月が不正です" };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { error: "CSVファイルを選択してください" };
  }
  if (file.size > 2_000_000) {
    return { error: "ファイルが大きすぎます（2MBまで）" };
  }

  const { decodeCsvBytes, parseTransactionCsv, resolveCategoryId, calendarMonthRange } =
    await import("@/lib/transactions-csv");
  const { fetchCategories } = await import("@/lib/data");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const text = decodeCsvBytes(bytes);
  const parsed = parseTransactionCsv(text, monthKey);
  if (parsed.error) return { error: parsed.error };

  const categories = await fetchCategories();
  const inserts: {
    user_id: string;
    date: string;
    amount: number;
    kind: TransactionKind;
    category_id: string | null;
    memo: string | null;
    recurring_rule_id: null;
  }[] = [];

  for (const row of parsed.rows) {
    const resolved = resolveCategoryId(categories, row.categoryName, row.kind);
    if (resolved.error) return { error: resolved.error };
    inserts.push({
      user_id: user.id,
      date: row.date,
      amount: row.amount,
      kind: row.kind,
      category_id: resolved.id,
      memo: row.memo,
      recurring_rule_id: null,
    });
  }

  const { start, end } = calendarMonthRange(monthKey);
  const { error: delError } = await supabase
    .from("transactions")
    .delete()
    .eq("user_id", user.id)
    .gte("date", start)
    .lte("date", end);
  if (delError) return { error: delError.message };

  if (inserts.length > 0) {
    const { error: insError } = await supabase.from("transactions").insert(inserts);
    if (insError) return { error: insError.message };
  }

  revalidateMoney();
  return { ok: true as const, imported: inserts.length };
}

export async function createRecurring(formData: FormData) {
  const { supabase, user } = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  const amount = parseAmount(formData.get("amount"));
  const kind = String(formData.get("kind") ?? "expense") as TransactionKind;
  const category_id = String(formData.get("category_id") ?? "") || null;
  const use_last_day = formData.get("use_last_day") === "on";
  const day_of_month = use_last_day
    ? 31
    : clampDay(Number(formData.get("day_of_month") ?? 1));
  const start_date = String(formData.get("start_date") ?? "");
  const end_date = String(formData.get("end_date") ?? "") || null;
  const asset_account_id = parseAssetAccountId(formData.get("asset_account_id"));

  if (!name || amount == null || !start_date) {
    return { error: "名前・金額・開始日を入力してください" };
  }

  const { error } = await supabase.from("recurring_rules").insert({
    user_id: user.id,
    name,
    amount,
    kind,
    category_id,
    day_of_month,
    start_date,
    end_date,
    interval: "monthly",
    asset_account_id,
  });
  if (error) return { error: error.message };
  revalidateMoney();
  return { ok: true };
}

export async function updateRecurring(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const amount = parseAmount(formData.get("amount"));
  const kind = String(formData.get("kind") ?? "expense") as TransactionKind;
  const category_id = String(formData.get("category_id") ?? "") || null;
  const use_last_day = formData.get("use_last_day") === "on";
  const day_of_month = use_last_day
    ? 31
    : clampDay(Number(formData.get("day_of_month") ?? 1));
  const start_date = String(formData.get("start_date") ?? "");
  const end_date = String(formData.get("end_date") ?? "") || null;
  const asset_account_id = parseAssetAccountId(formData.get("asset_account_id"));

  if (!id || !name || amount == null || !start_date) {
    return { error: "名前・金額・開始日を入力してください" };
  }

  const { error } = await supabase
    .from("recurring_rules")
    .update({
      name,
      amount,
      kind,
      category_id,
      day_of_month,
      start_date,
      end_date,
      asset_account_id,
    })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidateMoney();
  return { ok: true };
}

export async function deleteRecurring(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get("id") ?? "");
  await supabase.from("recurring_rules").delete().eq("id", id);
  revalidateMoney();
}

export async function upsertBalanceSnapshot(formData: FormData) {
  const { supabase, user } = await requireUser();
  const { ensureMainAssetAccount } = await import("@/lib/data");
  const as_of_date = String(formData.get("as_of_date") ?? "");
  const raw = String(formData.get("balance") ?? "").replace(/[,，]/g, "");
  const balance = Number(raw);
  const note = String(formData.get("note") ?? "").trim() || null;
  let asset_account_id = parseAssetAccountId(formData.get("asset_account_id"));

  if (!as_of_date || !Number.isFinite(balance)) {
    return { error: "日付と残高を入力してください" };
  }

  if (!asset_account_id) {
    const main = await ensureMainAssetAccount();
    asset_account_id = main?.id ?? null;
  }
  if (!asset_account_id) {
    return {
      error:
        "口座の準備に失敗しました。supabase/migrations/015_asset_accounts.sql を実行してください",
    };
  }

  // Keep legacy table in sync for main-account updates (compat)
  const { data: account } = await supabase
    .from("asset_accounts")
    .select("is_main")
    .eq("id", asset_account_id)
    .maybeSingle();

  const { error } = await supabase.from("account_balance_snapshots").upsert(
    {
      user_id: user.id,
      asset_account_id,
      as_of_date,
      balance: Math.round(balance),
      note,
    },
    { onConflict: "user_id,asset_account_id,as_of_date" },
  );
  if (error) {
    if (
      error.message.includes("account_balance_snapshots") ||
      error.message.includes("asset_accounts") ||
      error.message.includes("schema cache")
    ) {
      return {
        error:
          "口座残高には supabase/migrations/015_asset_accounts.sql の実行が必要です",
      };
    }
    return { error: error.message };
  }

  if (account?.is_main) {
    await supabase.from("balance_snapshots").upsert(
      {
        user_id: user.id,
        as_of_date,
        balance: Math.round(balance),
        note,
      },
      { onConflict: "user_id,as_of_date" },
    );
  }

  revalidateMoney();
  return { ok: true };
}

export async function createAccountTransfer(formData: FormData) {
  const { supabase, user } = await requireUser();
  const from_asset_account_id = parseAssetAccountId(
    formData.get("from_asset_account_id"),
  );
  const to_asset_account_id = parseAssetAccountId(
    formData.get("to_asset_account_id"),
  );
  const date = String(formData.get("date") ?? "");
  const amount = parseAmount(formData.get("amount"));
  const fee_amount = parseAmountOrZero(formData.get("fee_amount"));
  const memo = String(formData.get("memo") ?? "").trim() || null;

  if (!from_asset_account_id || !to_asset_account_id) {
    return { error: "出金口座と入金口座を選んでください" };
  }
  if (from_asset_account_id === to_asset_account_id) {
    return { error: "出金と入金は別の口座にしてください" };
  }
  if (!date || amount == null) {
    return { error: "日付と移動額を入力してください" };
  }
  if (fee_amount == null) {
    return { error: "手数料は 0 以上の数値にしてください" };
  }

  const { error } = await supabase.from("account_transfers").insert({
    user_id: user.id,
    from_asset_account_id,
    to_asset_account_id,
    date,
    amount,
    fee_amount,
    memo,
  });
  if (error) {
    if (
      error.message.includes("account_transfers") ||
      error.message.includes("schema cache")
    ) {
      return {
        error:
          "振替には supabase/migrations/016_account_transfers.sql の実行が必要です",
      };
    }
    return { error: error.message };
  }

  revalidateMoney();
  return { ok: true };
}

export async function deleteAccountTransfer(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "削除対象がありません" };
  const { error } = await supabase.from("account_transfers").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidateMoney();
  return { ok: true };
}

export async function deleteBalanceSnapshot(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get("id") ?? "");
  const { data: accSnap } = await supabase
    .from("account_balance_snapshots")
    .select("id, asset_account_id, as_of_date")
    .eq("id", id)
    .maybeSingle();
  if (accSnap) {
    const { data: account } = await supabase
      .from("asset_accounts")
      .select("is_main")
      .eq("id", accSnap.asset_account_id)
      .maybeSingle();
    await supabase.from("account_balance_snapshots").delete().eq("id", id);
    if (account?.is_main) {
      await supabase
        .from("balance_snapshots")
        .delete()
        .eq("as_of_date", accSnap.as_of_date);
    }
  } else {
    await supabase.from("balance_snapshots").delete().eq("id", id);
  }
  revalidateMoney();
}

export async function createAssetAccount(formData: FormData) {
  const { supabase, user } = await requireUser();
  const { ensureMainAssetAccount } = await import("@/lib/data");
  await ensureMainAssetAccount();

  const name = String(formData.get("name") ?? "").trim();
  const kindRaw = String(formData.get("kind") ?? "bank");
  const kind =
    kindRaw === "emoney" || kindRaw === "other" || kindRaw === "bank"
      ? kindRaw
      : "bank";

  if (!name) return { error: "口座名を入力してください" };

  const { data: maxRow } = await supabase
    .from("asset_accounts")
    .select("sort_order")
    .eq("user_id", user.id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from("asset_accounts")
    .insert({
      user_id: user.id,
      name,
      kind,
      is_main: false,
      sort_order: (maxRow?.sort_order ?? 0) + 1,
    })
    .select("*")
    .single();
  if (error) {
    if (
      error.message.includes("asset_accounts") ||
      error.message.includes("schema cache")
    ) {
      return {
        error:
          "口座機能には supabase/migrations/015_asset_accounts.sql の実行が必要です",
      };
    }
    return { error: error.message };
  }
  // revalidatePath は呼ばない（全体家計の重い再描画でボタンが固まるのを避ける）。
  // クライアント側で router.refresh() する。
  return { ok: true as const, account: data };
}

export async function updateAssetAccount(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const kindRaw = String(formData.get("kind") ?? "bank");
  const kind =
    kindRaw === "emoney" || kindRaw === "other" || kindRaw === "bank"
      ? kindRaw
      : "bank";
  const archived = String(formData.get("archived") ?? "") === "1";

  if (!id || !name) return { error: "口座名を入力してください" };

  const { data: row } = await supabase
    .from("asset_accounts")
    .select("is_main")
    .eq("id", id)
    .maybeSingle();
  if (row?.is_main && archived) {
    return { error: "メイン口座はアーカイブできません" };
  }

  const { error } = await supabase
    .from("asset_accounts")
    .update({
      name,
      kind: row?.is_main ? "bank" : kind,
      archived,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidateMoney();
  return { ok: true };
}

export async function deleteAssetAccount(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get("id") ?? "");
  const { data: row } = await supabase
    .from("asset_accounts")
    .select("is_main")
    .eq("id", id)
    .maybeSingle();
  if (row?.is_main) return { error: "メイン口座は削除できません" };

  const { error } = await supabase.from("asset_accounts").delete().eq("id", id);
  if (error) return { error: error.message };
  return { ok: true as const };
}

export async function saveSettings(formData: FormData) {
  const { supabase, user } = await requireUser();
  const payday_type = String(formData.get("payday_type") ?? "last_day") as PaydayType;
  const payday_day = clampDay(Number(formData.get("payday_day") ?? 31));

  const { error } = await supabase.from("user_settings").upsert({
    user_id: user.id,
    payday_type: payday_type === "fixed" ? "fixed" : "last_day",
    payday_day,
    updated_at: new Date().toISOString(),
  });
  if (error) return { error: error.message };
  revalidateMoney();
  return { ok: true };
}

export async function createCreditCard(formData: FormData) {
  const { supabase, user } = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  const closing_day = clampDay(Number(formData.get("closing_day") ?? 15));
  const payment_day = clampDay(Number(formData.get("payment_day") ?? 10));
  const payment_month_offset = Math.min(
    2,
    Math.max(0, Number(formData.get("payment_month_offset") ?? 1)),
  );
  const default_one_time_amount = parseAmountOrZero(
    formData.get("default_one_time_amount"),
  );
  const default_installment_amount = parseAmountOrZero(
    formData.get("default_installment_amount"),
  );
  if (!name) return { error: "カード名を入力してください" };
  if (default_one_time_amount == null || default_installment_amount == null) {
    return { error: "予定額を正しく入力してください" };
  }
  const asset_account_id = parseAssetAccountId(formData.get("asset_account_id"));

  const { error } = await supabase.from("credit_cards").insert({
    user_id: user.id,
    name,
    closing_day,
    payment_day,
    payment_month_offset,
    default_one_time_amount,
    default_installment_amount,
    asset_account_id,
  });
  if (error) return { error: error.message };
  revalidateMoney();
  return { ok: true };
}

export async function updateCreditCard(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const closing_day = clampDay(Number(formData.get("closing_day") ?? 15));
  const payment_day = clampDay(Number(formData.get("payment_day") ?? 10));
  const payment_month_offset = Math.min(
    2,
    Math.max(0, Number(formData.get("payment_month_offset") ?? 1)),
  );
  const default_one_time_amount = parseAmountOrZero(
    formData.get("default_one_time_amount"),
  );
  const default_installment_amount = parseAmountOrZero(
    formData.get("default_installment_amount"),
  );
  if (!id || !name) return { error: "入力内容を確認してください" };
  if (default_one_time_amount == null || default_installment_amount == null) {
    return { error: "予定額を正しく入力してください" };
  }
  const asset_account_id = parseAssetAccountId(formData.get("asset_account_id"));

  const { error } = await supabase
    .from("credit_cards")
    .update({
      name,
      closing_day,
      payment_day,
      payment_month_offset,
      default_one_time_amount,
      default_installment_amount,
      asset_account_id,
    })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidateMoney();
  return { ok: true };
}

export async function deleteCreditCard(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get("id") ?? "");
  await supabase.from("credit_cards").delete().eq("id", id);
  revalidateMoney();
}

export async function upsertCardPayment(formData: FormData) {
  const { supabase, user } = await requireUser();
  const id = String(formData.get("id") ?? "") || null;
  const credit_card_id = String(formData.get("credit_card_id") ?? "");
  const payment_date = String(formData.get("payment_date") ?? "");
  const one_time_amount = parseAmountOrZero(formData.get("one_time_amount"));
  const installment_amount = parseAmountOrZero(formData.get("installment_amount"));
  const note = String(formData.get("note") ?? "").trim() || null;

  if (
    !credit_card_id ||
    !payment_date ||
    one_time_amount == null ||
    installment_amount == null
  ) {
    return { error: "カード・引落日・金額を入力してください" };
  }

  if (id) {
    const { error } = await supabase
      .from("credit_card_payments")
      .update({
        credit_card_id,
        payment_date,
        one_time_amount,
        installment_amount,
        note,
      })
      .eq("id", id);
    if (error) {
      if (error.message.includes("duplicate") || error.code === "23505") {
        return {
          error: "その引落日にはすでに確定データがあります。日付を変えるか、先にそちらを削除してください",
        };
      }
      return { error: error.message };
    }
  } else {
    const { error } = await supabase.from("credit_card_payments").upsert(
      {
        user_id: user.id,
        credit_card_id,
        payment_date,
        one_time_amount,
        installment_amount,
        note,
      },
      { onConflict: "credit_card_id,payment_date" },
    );
    if (error) return { error: error.message };
  }

  revalidateMoney();
  return { ok: true };
}

export async function deleteCardPayment(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get("id") ?? "");
  await supabase.from("credit_card_payments").delete().eq("id", id);
  revalidateMoney();
}

export async function createLoan(formData: FormData) {
  const { supabase, user } = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  const principal_amount = parseAmountOrZero(formData.get("principal_amount"));
  const interest_amount = parseAmountOrZero(formData.get("interest_amount"));
  const use_last_day = formData.get("use_last_day") === "on";
  const payment_day = use_last_day
    ? 31
    : clampDay(Number(formData.get("payment_day") ?? 27));
  const start_date = String(formData.get("start_date") ?? "");
  const end_date = String(formData.get("end_date") ?? "") || null;

  if (!name || principal_amount == null || interest_amount == null || !start_date) {
    return { error: "名前・金額・開始日を入力してください" };
  }
  if (principal_amount + interest_amount <= 0) {
    return { error: "返済額か利息のどちらかを入力してください" };
  }
  const asset_account_id = parseAssetAccountId(formData.get("asset_account_id"));

  const { error } = await supabase.from("loans").insert({
    user_id: user.id,
    name,
    principal_amount,
    interest_amount,
    payment_day,
    start_date,
    end_date,
    asset_account_id,
  });
  if (error) return { error: error.message };
  revalidateMoney();
  return { ok: true };
}

export async function updateLoan(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const principal_amount = parseAmountOrZero(formData.get("principal_amount"));
  const interest_amount = parseAmountOrZero(formData.get("interest_amount"));
  const use_last_day = formData.get("use_last_day") === "on";
  const payment_day = use_last_day
    ? 31
    : clampDay(Number(formData.get("payment_day") ?? 27));
  const start_date = String(formData.get("start_date") ?? "");
  const end_date = String(formData.get("end_date") ?? "") || null;

  if (
    !id ||
    !name ||
    principal_amount == null ||
    interest_amount == null ||
    !start_date
  ) {
    return { error: "入力内容を確認してください" };
  }
  const asset_account_id = parseAssetAccountId(formData.get("asset_account_id"));

  const { error } = await supabase
    .from("loans")
    .update({
      name,
      principal_amount,
      interest_amount,
      payment_day,
      start_date,
      end_date,
      asset_account_id,
    })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidateMoney();
  return { ok: true };
}

export async function deleteLoan(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get("id") ?? "");
  await supabase.from("loans").delete().eq("id", id);
  revalidateMoney();
}

export async function upsertLoanPayment(formData: FormData) {
  const { supabase, user } = await requireUser();
  const id = String(formData.get("id") ?? "") || null;
  const loan_id = String(formData.get("loan_id") ?? "");
  const payment_date = String(formData.get("payment_date") ?? "");
  const principal_amount = parseAmountOrZero(formData.get("principal_amount"));
  const interest_amount = parseAmountOrZero(formData.get("interest_amount"));
  const note = String(formData.get("note") ?? "").trim() || null;

  if (
    !loan_id ||
    !payment_date ||
    principal_amount == null ||
    interest_amount == null
  ) {
    return { error: "ローン・支払日・金額を入力してください" };
  }

  if (id) {
    const { error } = await supabase
      .from("loan_payments")
      .update({
        loan_id,
        payment_date,
        principal_amount,
        interest_amount,
        note,
      })
      .eq("id", id);
    if (error) {
      if (error.message.includes("duplicate") || error.code === "23505") {
        return {
          error: "その支払日にはすでに確定データがあります。日付を変えるか、先にそちらを削除してください",
        };
      }
      return { error: error.message };
    }
  } else {
    const { error } = await supabase.from("loan_payments").upsert(
      {
        user_id: user.id,
        loan_id,
        payment_date,
        principal_amount,
        interest_amount,
        note,
      },
      { onConflict: "loan_id,payment_date" },
    );
    if (error) return { error: error.message };
  }

  revalidateMoney();
  return { ok: true };
}

export async function deleteLoanPayment(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get("id") ?? "");
  await supabase.from("loan_payments").delete().eq("id", id);
  revalidateMoney();
}

export async function createDailySpendEntry(formData: FormData) {
  const { supabase, user } = await requireUser();
  const date = String(formData.get("date") ?? "");
  const amount = parseAmountOrZero(formData.get("amount"));
  const points_amount = parseAmountOrZero(formData.get("points_amount"));
  const category_id = String(formData.get("category_id") ?? "");
  const memo = String(formData.get("memo") ?? "").trim() || null;

  if (!date || amount == null || points_amount == null || !category_id) {
    return { error: "日付・金額・用途を入力してください" };
  }
  if (amount === 0 && points_amount === 0) {
    return { error: "金額かポイント決済のどちらかを入力してください" };
  }

  const { error } = await supabase.from("daily_spend_entries").insert({
    user_id: user.id,
    date,
    amount,
    points_amount,
    category_id,
    memo,
  });
  if (error) return { error: error.message };
  revalidateMoney();
  return { ok: true };
}

export async function updateDailySpendEntry(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get("id") ?? "");
  const date = String(formData.get("date") ?? "");
  const amount = parseAmountOrZero(formData.get("amount"));
  const points_amount = parseAmountOrZero(formData.get("points_amount"));
  const category_id = String(formData.get("category_id") ?? "");
  const memo = String(formData.get("memo") ?? "").trim() || null;

  if (!id || !date || amount == null || points_amount == null || !category_id) {
    return { error: "入力内容を確認してください" };
  }
  if (amount === 0 && points_amount === 0) {
    return { error: "金額かポイント決済のどちらかを入力してください" };
  }

  const { error } = await supabase
    .from("daily_spend_entries")
    .update({ date, amount, points_amount, category_id, memo })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidateMoney();
  return { ok: true };
}

export async function deleteDailySpendEntry(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get("id") ?? "");
  await supabase.from("daily_spend_entries").delete().eq("id", id);
  revalidateMoney();
}

export async function deleteDailySpendEntries(formData: FormData) {
  const { supabase } = await requireUser();
  const ids = formData.getAll("id").map(String).filter(Boolean);
  if (ids.length === 0) {
    return { error: "削除する項目を選択してください" };
  }
  const { error } = await supabase
    .from("daily_spend_entries")
    .delete()
    .in("id", ids);
  if (error) return { error: error.message };
  revalidateMoney();
  return { ok: true };
}

export async function moveDailySpendEntries(formData: FormData) {
  const { supabase } = await requireUser();
  const category_id = String(formData.get("category_id") ?? "");
  const ids = formData.getAll("id").map(String).filter(Boolean);
  if (!category_id || ids.length === 0) {
    return { error: "用途と項目を選択してください" };
  }
  const { error } = await supabase
    .from("daily_spend_entries")
    .update({ category_id })
    .in("id", ids);
  if (error) return { error: error.message };
  revalidateMoney();
  return { ok: true };
}

export async function updateDailySpendCategory(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const monthly_budget = parseAmountOrZero(formData.get("monthly_budget"));
  const color = String(formData.get("color") ?? "#0f766e");

  if (!id || !name || monthly_budget == null) {
    return { error: "用途名と月予算を入力してください" };
  }

  const { error } = await supabase
    .from("daily_spend_categories")
    .update({ name, monthly_budget, color })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidateMoney();
  return { ok: true };
}

/** Suica 残高を登録（その日時点を正とする。同日は上書き） */
export async function upsertSuicaBalance(formData: FormData) {
  const { supabase, user } = await requireUser();
  const as_of_date = String(formData.get("as_of_date") ?? "");
  const raw = String(formData.get("balance") ?? "").replace(/[,，]/g, "");
  const balance = Number(raw);
  const note = String(formData.get("note") ?? "").trim() || null;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(as_of_date) || !Number.isFinite(balance)) {
    return { error: "日付と残高を入力してください" };
  }
  if (balance < 0) {
    return { error: "残高は 0 以上で入力してください" };
  }

  const { error } = await supabase.from("suica_balance_snapshots").upsert(
    {
      user_id: user.id,
      as_of_date,
      balance: Math.round(balance),
      note,
    },
    { onConflict: "user_id,as_of_date" },
  );
  if (error) {
    if (
      error.message.includes("suica_balance_snapshots") ||
      error.message.includes("schema cache")
    ) {
      return {
        error:
          "Suica には supabase/migrations/017_suica_balance_snapshots.sql の実行が必要です",
      };
    }
    return { error: error.message };
  }
  // クライアントで router.refresh（重い revalidateMoney は避ける）
  return { ok: true as const };
}

export async function setDailySpendHoliday(formData: FormData) {
  const { supabase, user } = await requireUser();
  const date = String(formData.get("date") ?? "");
  const enabled = String(formData.get("enabled") ?? "") === "1";
  const note = String(formData.get("note") ?? "").trim() || null;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { error: "日付が不正です" };
  }

  if (enabled) {
    const { error } = await supabase.from("daily_spend_holidays").upsert(
      {
        user_id: user.id,
        date,
        note,
      },
      { onConflict: "user_id,date" },
    );
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from("daily_spend_holidays")
      .delete()
      .eq("date", date);
    if (error) return { error: error.message };
  }

  revalidateMoney();
  return { ok: true };
}

export async function setDailySpendMakikoOff(formData: FormData) {
  const { supabase, user } = await requireUser();
  const date = String(formData.get("date") ?? "");
  const enabled = String(formData.get("enabled") ?? "") === "1";
  const note = String(formData.get("note") ?? "").trim() || null;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { error: "日付が不正です" };
  }

  if (enabled) {
    const { error } = await supabase.from("daily_spend_makiko_offs").upsert(
      {
        user_id: user.id,
        date,
        note,
      },
      { onConflict: "user_id,date" },
    );
    if (error) {
      if (
        error.message.includes("daily_spend_makiko_offs") ||
        error.message.includes("schema cache") ||
        error.message.includes("does not exist")
      ) {
        return {
          error:
            "マキコ休みには supabase/migrations/014_daily_spend_makiko_offs.sql の実行が必要です",
        };
      }
      return { error: error.message };
    }
  } else {
    const { error } = await supabase
      .from("daily_spend_makiko_offs")
      .delete()
      .eq("date", date);
    if (error) return { error: error.message };
  }

  revalidateMoney();
  return { ok: true };
}

export async function saveDailyScratchpad(_monthKey: string, body: string) {
  const { supabase, user } = await requireUser();
  const text = String(body ?? "");
  if (text.length > 20_000) {
    return { error: "メモが長すぎます（2万文字まで）" };
  }

  const { error } = await supabase.from("daily_scratchpads").upsert(
    {
      user_id: user.id,
      month_key: "shared",
      body: text,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,month_key" },
  );
  if (error) {
    if (
      error.message.includes("daily_scratchpads") ||
      error.code === "42P01" ||
      /does not exist|relation/i.test(error.message)
    ) {
      return {
        error:
          "メモ保存には supabase/migrations/010_daily_scratchpads.sql と 011_scratchpad_shared.sql の実行が必要です",
      };
    }
    return { error: error.message };
  }

  revalidatePath("/calendar");
  return { ok: true as const };
}

function migrationMissing(error: { message: string; code?: string }, table: string) {
  return (
    error.message.includes(table) ||
    error.code === "42P01" ||
    /does not exist|relation/i.test(error.message)
  );
}

export async function createLunchMenuItem(formData: FormData) {
  const { supabase, user } = await requireUser();
  const store_name = String(formData.get("store_name") ?? "").trim();
  const item_name = String(formData.get("item_name") ?? "").trim();
  const amount = parseAmount(formData.get("amount"));
  if (!store_name || !item_name) {
    return { error: "店名と名称を入力してください" };
  }
  if (amount == null) return { error: "金額を正しく入力してください" };

  const { data: last } = await supabase
    .from("lunch_menu_items")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sort_order = (last?.sort_order ?? -1) + 1;

  const { error } = await supabase.from("lunch_menu_items").insert({
    user_id: user.id,
    store_name,
    item_name,
    amount,
    sort_order,
  });
  if (error) {
    if (migrationMissing(error, "lunch_menu_items")) {
      return {
        error:
          "昼食計算には supabase/migrations/012_lunch_menu_items.sql の実行が必要です",
      };
    }
    return { error: error.message };
  }
  revalidatePath("/calendar/lunch-calc");
  revalidatePath("/calendar");
  return { ok: true as const };
}

export async function updateLunchMenuItem(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get("id") ?? "");
  const store_name = String(formData.get("store_name") ?? "").trim();
  const item_name = String(formData.get("item_name") ?? "").trim();
  const amount = parseAmount(formData.get("amount"));
  if (!id) return { error: "対象が見つかりません" };
  if (!store_name || !item_name) {
    return { error: "店名と名称を入力してください" };
  }
  if (amount == null) return { error: "金額を正しく入力してください" };

  const { error } = await supabase
    .from("lunch_menu_items")
    .update({
      store_name,
      item_name,
      amount,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/calendar/lunch-calc");
  return { ok: true as const };
}

export async function deleteLunchMenuItem(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "対象が見つかりません" };
  const { error } = await supabase.from("lunch_menu_items").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/calendar/lunch-calc");
  return { ok: true as const };
}

export async function moveLunchMenuItem(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get("id") ?? "");
  const direction = String(formData.get("direction") ?? "");
  if (!id || (direction !== "up" && direction !== "down")) {
    return { error: "並べ替えに失敗しました" };
  }

  const { data: rows, error } = await supabase
    .from("lunch_menu_items")
    .select("id, sort_order")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error || !rows) return { error: error?.message ?? "読み込みに失敗しました" };

  const index = rows.findIndex((r) => r.id === id);
  if (index < 0) return { error: "対象が見つかりません" };
  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (swapIndex < 0 || swapIndex >= rows.length) return { ok: true as const };

  const ordered = [...rows];
  const tmp = ordered[index];
  ordered[index] = ordered[swapIndex];
  ordered[swapIndex] = tmp;

  const now = new Date().toISOString();
  for (let i = 0; i < ordered.length; i++) {
    const { error: upErr } = await supabase
      .from("lunch_menu_items")
      .update({ sort_order: i, updated_at: now })
      .eq("id", ordered[i].id);
    if (upErr) return { error: upErr.message };
  }

  revalidatePath("/calendar/lunch-calc");
  return { ok: true as const };
}

export async function saveLocalBackup(label = "manual") {
  await requireUser();
  const { buildLedgerBackup } = await import("@/lib/backup");
  const { mkdir, writeFile } = await import("fs/promises");
  const pathMod = await import("path");
  const { transactionsToCsv } = await import("@/lib/transactions-csv");
  const { encodeCsvForDownload } = await import("@/lib/csv");

  const backup = await buildLedgerBackup();
  if (!backup) return { error: "ログインが必要です" };

  const safeLabel = String(label).replace(/[^\w\-]+/g, "_") || "manual";
  const stamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace("T", "_")
    .slice(0, 19);
  const dirName = `${stamp}_${safeLabel}`;
  const dir = pathMod.join(process.cwd(), "backups", dirName);
  await mkdir(dir, { recursive: true });
  await writeFile(
    pathMod.join(dir, "ledger-backup.json"),
    JSON.stringify(backup, null, 2),
    "utf8",
  );

  const byMonth = new Map<string, typeof backup.transactions>();
  for (const t of backup.transactions) {
    const month = t.date.slice(0, 7);
    const list = byMonth.get(month) ?? [];
    list.push(t);
    byMonth.set(month, list);
  }
  for (const [month, rows] of byMonth) {
    const csv = transactionsToCsv(month, rows);
    const { body } = encodeCsvForDownload(csv, "utf8");
    await writeFile(
      pathMod.join(dir, `transactions-${month}.csv`),
      Buffer.from(body),
    );
  }

  await writeFile(
    pathMod.join(dir, "README.txt"),
    [
      "TECHOox backup",
      `exportedAt: ${backup.exportedAt}`,
      `dir: backups/${dirName}`,
      `transactions: ${backup.transactions.length}`,
      `categories: ${backup.categories.length}`,
      `recurringRules: ${backup.recurringRules.length}`,
      `dailySpendEntries: ${backup.dailySpendEntries.length}`,
    ].join("\n"),
    "utf8",
  );

  return { ok: true as const, dir: `backups/${dirName}` };
}

export async function restoreLocalBackup(dirName: string) {
  await requireUser();
  const { readFile } = await import("fs/promises");
  const pathMod = await import("path");
  const { restoreLedgerBackup } = await import("@/lib/backup");

  const safe = String(dirName).replace(/[\\/]/g, "");
  if (!safe || safe !== dirName) {
    return { error: "バックアップ名が不正です" };
  }

  let backup: import("@/lib/backup").LedgerBackup;
  try {
    const raw = await readFile(
      pathMod.join(process.cwd(), "backups", safe, "ledger-backup.json"),
      "utf8",
    );
    backup = JSON.parse(raw);
  } catch {
    return { error: "バックアップファイルを読めませんでした" };
  }

  const result = await restoreLedgerBackup(backup);
  if ("error" in result) return { error: result.error };
  revalidateMoney();
  return { ok: true as const, summary: result.summary };
}

export async function createLedgerScenario(name: string) {
  await requireUser();
  const { createScenarioFromCurrent } = await import("@/lib/scenarios");
  const result = await createScenarioFromCurrent(name);
  if ("error" in result) return { error: result.error };
  revalidateMoney();
  return { ok: true as const, id: result.id, name: result.name };
}

export async function switchLedgerScenario(id: string) {
  await requireUser();
  const { switchScenario } = await import("@/lib/scenarios");
  const result = await switchScenario(id);
  if ("error" in result) return { error: result.error };
  revalidateMoney();
  return { ok: true as const, summary: result.summary };
}

export async function renameLedgerScenario(id: string, name: string) {
  await requireUser();
  const { renameScenario } = await import("@/lib/scenarios");
  const result = await renameScenario(id, name);
  if ("error" in result) return { error: result.error };
  revalidatePath("/settings");
  return { ok: true as const };
}

export async function deleteLedgerScenario(id: string) {
  await requireUser();
  const { deleteScenario } = await import("@/lib/scenarios");
  const result = await deleteScenario(id);
  if ("error" in result) return { error: result.error };
  revalidatePath("/settings");
  return { ok: true as const };
}

async function ensureSalaryIncomeCategory(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
) {
  const { fetchCategories, fetchRecurringRules } = await import("@/lib/data");
  const categories = await fetchCategories();
  const existing = categories.find(
    (c) =>
      c.kind === "income" &&
      (c.name === "給与" || c.name === "給料" || c.name === "給与振込"),
  );
  if (existing) {
    return { category: existing, rules: await fetchRecurringRules() };
  }

  const { data, error } = await supabase
    .from("categories")
    .insert({
      user_id: userId,
      name: "給与",
      kind: "income",
      color: "#0f766e",
      sort_order: 0,
    })
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(error?.message ?? "給与項目を作成できませんでした");
  }
  return {
    category: data as import("@/lib/types").Category,
    rules: await fetchRecurringRules(),
  };
}

function pickSalaryRecurringRule(
  rules: import("@/lib/types").RecurringRule[],
  payday: string,
  categoryId: string | null,
) {
  const day = Number(payday.slice(8, 10));
  const incomeRules = rules.filter((r) => r.kind === "income");
  const byName = incomeRules.find((r) => /給与|給料/.test(r.name));
  if (byName) return byName;
  const byCategory = categoryId
    ? incomeRules.find((r) => r.category_id === categoryId)
    : undefined;
  if (byCategory) return byCategory;
  return incomeRules.find(
    (r) => r.day_of_month === day || r.day_of_month === 31,
  );
}

export async function previewPayslipFromData(filename: string) {
  await requireUser();
  try {
    const {
      extractPayslipFromPdf,
      readPayslipFile,
    } = await import("@/lib/payslip-pdf");
    const bytes = await readPayslipFile(filename);
    const parsed = await extractPayslipFromPdf(bytes);
    return { ok: true as const, parsed };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "PDFを解析できませんでした",
    };
  }
}

export async function previewPayslipUpload(formData: FormData) {
  await requireUser();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "PDFファイルを選択してください" };
  }
  if (file.size > 5_000_000) {
    return { error: "ファイルが大きすぎます（5MBまで）" };
  }
  if (
    !file.name.toLowerCase().endsWith(".pdf") &&
    file.type !== "application/pdf"
  ) {
    return { error: "PDFファイルを選択してください" };
  }

  try {
    const {
      extractPayslipFromPdf,
      savePayslipFile,
    } = await import("@/lib/payslip-pdf");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const parsed = await extractPayslipFromPdf(bytes);
    const preferred =
      file.name.includes("給与明細")
        ? file.name
        : `${parsed.payday.replace(/-/g, "_")}_給与明細.pdf`;
    const savedAs = await savePayslipFile(bytes, preferred);
    return {
      ok: true as const,
      parsed,
      filename: savedAs,
      savedAs,
    };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "PDFを解析できませんでした",
    };
  }
}

export async function importPayslipPdf(input: {
  filename: string;
  source?: "data" | "upload";
}) {
  const { supabase, user } = await requireUser();
  const filename = String(input.filename ?? "").trim();
  if (!filename) return { error: "ファイル名が不正です" };

  try {
    const {
      extractPayslipFromPdf,
      isPayslipMemo,
      payslipMemo,
      readPayslipFile,
    } = await import("@/lib/payslip-pdf");

    const bytes = await readPayslipFile(filename);
    const parsed = await extractPayslipFromPdf(bytes);
    const { category, rules } = await ensureSalaryIncomeCategory(
      supabase,
      user.id,
    );
    const rule = pickSalaryRecurringRule(rules, parsed.payday, category.id);
    const memo = payslipMemo(parsed.targetLabel);

    const { data: existing, error: existingError } = await supabase
      .from("transactions")
      .select("id, memo, amount, category_id, recurring_rule_id")
      .eq("user_id", user.id)
      .eq("date", parsed.payday)
      .eq("kind", "income");
    if (existingError) return { error: existingError.message };

    /** 概算給与・前回取込・同カテゴリの同日収入を正確額で置き換える（ボーナス等の別メモは残す） */
    const replaceIds = (existing ?? [])
      .filter((row) => {
        if (isPayslipMemo(row.memo)) return true;
        if (rule && row.recurring_rule_id === rule.id) return true;
        if (row.category_id === category.id) {
          const m = (row.memo ?? "").trim();
          if (!m || /^(給与|給料)$/.test(m) || (rule && m === rule.name)) {
            return true;
          }
          if (rule && row.amount === rule.amount) return true;
        }
        return false;
      })
      .map((row) => row.id);

    if (replaceIds.length > 0) {
      const { error: delError } = await supabase
        .from("transactions")
        .delete()
        .in("id", replaceIds);
      if (delError) return { error: delError.message };
    }

    const { data: inserted, error: insError } = await supabase
      .from("transactions")
      .insert({
        user_id: user.id,
        date: parsed.payday,
        amount: parsed.netPay,
        kind: "income" as TransactionKind,
        category_id: category.id,
        memo,
        recurring_rule_id: rule?.id ?? null,
      })
      .select("id")
      .single();
    if (insError) return { error: insError.message };

    const { error: slipError } = await supabase.from("payslip_imports").upsert(
      {
        user_id: user.id,
        transaction_id: inserted.id,
        payday: parsed.payday,
        target_label: parsed.targetLabel,
        filename,
        net_pay: parsed.netPay,
        gross_pay: parsed.grossPay,
        deduction_total: parsed.deductionTotal,
        details: parsed.lines,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,payday" },
    );
    if (slipError) {
      // 明細本体は登録済み。詳細テーブル未作成時は案内する
      revalidateMoney();
      return {
        ok: true as const,
        payday: parsed.payday,
        amount: parsed.netPay,
        replaced: replaceIds.length,
        linkedRule: Boolean(rule),
        detailWarning:
          slipError.message.includes("payslip_imports") ||
          slipError.code === "42P01" ||
          /does not exist|relation/i.test(slipError.message)
            ? "収入は登録しました。明細詳細の保存には supabase/migrations/009_payslip_imports.sql の実行が必要です"
            : `収入は登録しましたが詳細の保存に失敗: ${slipError.message}`,
      };
    }

    revalidateMoney();
    return {
      ok: true as const,
      payday: parsed.payday,
      amount: parsed.netPay,
      replaced: replaceIds.length,
      linkedRule: Boolean(rule),
    };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "取込に失敗しました",
    };
  }
}
