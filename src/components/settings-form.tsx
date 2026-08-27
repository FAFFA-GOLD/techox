"use client";

import { useState, useTransition } from "react";
import { saveSettings } from "@/app/actions";
import type { UserSettings } from "@/lib/types";

export function SettingsForm({ settings }: { settings: UserSettings }) {
  const [type, setType] = useState(settings.payday_type);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="grid max-w-lg gap-4 rounded-xl border border-line/80 bg-surface p-5"
      action={(fd) => {
        startTransition(async () => {
          const res = await saveSettings(fd);
          setError(res?.error ?? null);
          setOk(!res?.error);
        });
      }}
    >
      <h2 className="text-lg font-bold">給料日設定</h2>
      <p className="text-sm text-muted">
        全体家計は「給料日〜次の給料日前日」です。デフォルトは毎月末日。
      </p>
      <label className="grid gap-1 text-sm">
        <span className="text-muted">給料日の種類</span>
        <select
          name="payday_type"
          value={type}
          onChange={(e) => setType(e.target.value as "last_day" | "fixed")}
          className="rounded-md border border-line bg-white px-3 py-2"
        >
          <option value="last_day">毎月末日</option>
          <option value="fixed">毎月固定日</option>
        </select>
      </label>
      {type === "fixed" ? (
        <label className="grid gap-1 text-sm">
          <span className="text-muted">固定日（1〜31・無い日は月末）</span>
          <input
            name="payday_day"
            type="number"
            min={1}
            max={31}
            defaultValue={settings.payday_day}
            className="rounded-md border border-line bg-white px-3 py-2"
          />
        </label>
      ) : (
        <input type="hidden" name="payday_day" value={31} />
      )}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-accent px-4 py-2 text-white hover:bg-accent-deep disabled:opacity-60"
        >
          {pending ? "保存中…" : "保存"}
        </button>
        {ok && !error ? <span className="text-sm text-income">保存しました</span> : null}
        {error ? <span className="text-sm text-expense">{error}</span> : null}
      </div>
    </form>
  );
}
