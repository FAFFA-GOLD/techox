import { createClient } from "@/lib/supabase/server";
import {
  applyLedgerBackupToUser,
  buildLedgerBackup,
  type LedgerBackup,
} from "@/lib/backup";

export const MAIN_SCENARIO_NAME = "本線";

export type LedgerScenarioRow = {
  id: string;
  user_id: string;
  name: string;
  is_main: boolean;
  is_active: boolean;
  payload: LedgerBackup | null;
  created_at: string;
  updated_at: string;
};

export type ScenarioListItem = {
  id: string;
  name: string;
  isMain: boolean;
  isActive: boolean;
  updatedAt: string;
};

type Ok = { ok: true };
type Err = { error: string };
type Result<T = object> = (Ok & T) | Err;

function migrationHint(message: string) {
  if (
    message.includes("ledger_scenarios") ||
    message.includes("schema cache") ||
    message.includes("does not exist")
  ) {
    return "シナリオ機能には supabase/migrations/013_ledger_scenarios.sql の実行が必要です";
  }
  return message;
}

async function currentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function ensureMainScenario(): Promise<Result> {
  const { supabase, user } = await currentUser();
  if (!user) return { error: "ログインが必要です" };

  const { data: existing, error } = await supabase
    .from("ledger_scenarios")
    .select("id")
    .eq("user_id", user.id)
    .limit(1);

  if (error) return { error: migrationHint(error.message) };
  if (existing && existing.length > 0) return { ok: true };

  const { error: insertError } = await supabase.from("ledger_scenarios").insert({
    user_id: user.id,
    name: MAIN_SCENARIO_NAME,
    is_main: true,
    is_active: true,
    payload: null,
  });
  if (insertError) return { error: migrationHint(insertError.message) };
  return { ok: true };
}

export async function listScenarios(): Promise<
  Result<{ scenarios: ScenarioListItem[] }>
> {
  const ensured = await ensureMainScenario();
  if ("error" in ensured) return ensured;

  const { supabase, user } = await currentUser();
  if (!user) return { error: "ログインが必要です" };

  const { data, error } = await supabase
    .from("ledger_scenarios")
    .select("id, name, is_main, is_active, updated_at")
    .eq("user_id", user.id)
    .order("is_main", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) return { error: migrationHint(error.message) };

  const scenarios: ScenarioListItem[] = (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    isMain: Boolean(row.is_main),
    isActive: Boolean(row.is_active),
    updatedAt: row.updated_at as string,
  }));

  return { ok: true, scenarios };
}

export async function getActiveScenario(): Promise<
  Result<{ scenario: ScenarioListItem | null }>
> {
  const { supabase, user } = await currentUser();
  if (!user) return { error: "ログインが必要です" };

  const { data, error } = await supabase
    .from("ledger_scenarios")
    .select("id, name, is_main, is_active, updated_at")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    // Table missing → treat as no active banner
    if (
      error.message.includes("ledger_scenarios") ||
      error.message.includes("schema cache") ||
      error.message.includes("does not exist")
    ) {
      return { ok: true, scenario: null };
    }
    return { error: error.message };
  }

  if (!data) return { ok: true, scenario: null };

  return {
    ok: true,
    scenario: {
      id: data.id as string,
      name: data.name as string,
      isMain: Boolean(data.is_main),
      isActive: true,
      updatedAt: data.updated_at as string,
    },
  };
}

async function dumpLiveToScenario(
  scenarioId: string,
): Promise<Result<{ backup: LedgerBackup }>> {
  const { supabase, user } = await currentUser();
  if (!user) return { error: "ログインが必要です" };

  const backup = await buildLedgerBackup();
  if (!backup) return { error: "ライブデータの取得に失敗しました" };

  const { error } = await supabase
    .from("ledger_scenarios")
    .update({
      payload: backup,
      updated_at: new Date().toISOString(),
    })
    .eq("id", scenarioId)
    .eq("user_id", user.id);

  if (error) return { error: migrationHint(error.message) };
  return { ok: true, backup };
}

export async function createScenarioFromCurrent(
  name: string,
): Promise<Result<{ id: string; name: string }>> {
  const trimmed = name.trim();
  if (!trimmed) return { error: "シナリオ名を入力してください" };
  if (trimmed === MAIN_SCENARIO_NAME) {
    return { error: `「${MAIN_SCENARIO_NAME}」は予約名です` };
  }

  const ensured = await ensureMainScenario();
  if ("error" in ensured) return ensured;

  const { supabase, user } = await currentUser();
  if (!user) return { error: "ログインが必要です" };

  const { data: active, error: activeError } = await supabase
    .from("ledger_scenarios")
    .select("id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (activeError) return { error: migrationHint(activeError.message) };
  if (!active) return { error: "アクティブなシナリオがありません" };

  const dumped = await dumpLiveToScenario(active.id as string);
  if ("error" in dumped) return dumped;

  const { data: dup } = await supabase
    .from("ledger_scenarios")
    .select("id")
    .eq("user_id", user.id)
    .eq("name", trimmed)
    .maybeSingle();
  if (dup) return { error: "同じ名前のシナリオが既にあります" };

  // Deactivate current, keep its payload (just dumped)
  const { error: deactivateError } = await supabase
    .from("ledger_scenarios")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", active.id)
    .eq("user_id", user.id);
  if (deactivateError) {
    return { error: migrationHint(deactivateError.message) };
  }

  // New scenario becomes active; live DB already matches the dump
  const { data: created, error: createError } = await supabase
    .from("ledger_scenarios")
    .insert({
      user_id: user.id,
      name: trimmed,
      is_main: false,
      is_active: true,
      payload: null,
    })
    .select("id, name")
    .single();

  if (createError) {
    // rollback active flag best-effort
    await supabase
      .from("ledger_scenarios")
      .update({ is_active: true })
      .eq("id", active.id);
    return { error: migrationHint(createError.message) };
  }

  return {
    ok: true,
    id: created.id as string,
    name: created.name as string,
  };
}

export async function switchScenario(id: string): Promise<Result<{ summary: string }>> {
  const ensured = await ensureMainScenario();
  if ("error" in ensured) return ensured;

  const { supabase, user } = await currentUser();
  if (!user) return { error: "ログインが必要です" };

  const { data: target, error: targetError } = await supabase
    .from("ledger_scenarios")
    .select("id, name, is_active, payload")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (targetError) return { error: migrationHint(targetError.message) };
  if (!target) return { error: "シナリオが見つかりません" };
  if (target.is_active) {
    return { ok: true, summary: "すでにこのシナリオです" };
  }

  const payload = target.payload as LedgerBackup | null;
  if (!payload || payload.version !== 1) {
    return { error: "切替先シナリオに保存データがありません" };
  }

  const { data: active, error: activeError } = await supabase
    .from("ledger_scenarios")
    .select("id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (activeError) return { error: migrationHint(activeError.message) };
  if (!active) return { error: "アクティブなシナリオがありません" };

  const dumped = await dumpLiveToScenario(active.id as string);
  if ("error" in dumped) return dumped;

  const restored = await applyLedgerBackupToUser(supabase, user.id, {
    ...payload,
    userId: user.id,
  });
  if ("error" in restored) return restored;

  const now = new Date().toISOString();
  const { error: deactivateError } = await supabase
    .from("ledger_scenarios")
    .update({ is_active: false, updated_at: now })
    .eq("id", active.id)
    .eq("user_id", user.id);
  if (deactivateError) return { error: migrationHint(deactivateError.message) };

  const { error: activateError } = await supabase
    .from("ledger_scenarios")
    .update({
      is_active: true,
      payload: null,
      updated_at: now,
    })
    .eq("id", target.id)
    .eq("user_id", user.id);

  if (activateError) {
    // Try to put live back to previous active state
    await applyLedgerBackupToUser(supabase, user.id, dumped.backup);
    await supabase
      .from("ledger_scenarios")
      .update({ is_active: true, payload: null })
      .eq("id", active.id);
    return { error: migrationHint(activateError.message) };
  }

  return { ok: true, summary: restored.summary };
}

export async function renameScenario(
  id: string,
  name: string,
): Promise<Result> {
  const trimmed = name.trim();
  if (!trimmed) return { error: "シナリオ名を入力してください" };
  if (trimmed === MAIN_SCENARIO_NAME) {
    return { error: `「${MAIN_SCENARIO_NAME}」は予約名です` };
  }

  const { supabase, user } = await currentUser();
  if (!user) return { error: "ログインが必要です" };

  const { data: row, error } = await supabase
    .from("ledger_scenarios")
    .select("id, is_main")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return { error: migrationHint(error.message) };
  if (!row) return { error: "シナリオが見つかりません" };
  if (row.is_main) return { error: "本線の名前は変更できません" };

  const { data: dup } = await supabase
    .from("ledger_scenarios")
    .select("id")
    .eq("user_id", user.id)
    .eq("name", trimmed)
    .neq("id", id)
    .maybeSingle();
  if (dup) return { error: "同じ名前のシナリオが既にあります" };

  const { error: updateError } = await supabase
    .from("ledger_scenarios")
    .update({ name: trimmed, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);

  if (updateError) return { error: migrationHint(updateError.message) };
  return { ok: true };
}

export async function deleteScenario(id: string): Promise<Result> {
  const { supabase, user } = await currentUser();
  if (!user) return { error: "ログインが必要です" };

  const { data: row, error } = await supabase
    .from("ledger_scenarios")
    .select("id, is_main, is_active")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return { error: migrationHint(error.message) };
  if (!row) return { error: "シナリオが見つかりません" };
  if (row.is_main) return { error: "本線は削除できません" };
  if (row.is_active) return { error: "使用中のシナリオは削除できません" };

  const { error: deleteError } = await supabase
    .from("ledger_scenarios")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (deleteError) return { error: migrationHint(deleteError.message) };
  return { ok: true };
}
