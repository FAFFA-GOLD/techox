"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  createLedgerScenario,
  deleteLedgerScenario,
  renameLedgerScenario,
  switchLedgerScenario,
} from "@/app/actions";
import type { ScenarioListItem } from "@/lib/scenarios";

type Props = {
  scenarios: ScenarioListItem[];
};

export function ScenarioPanel({ scenarios }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [selectedId, setSelectedId] = useState(
    scenarios.find((s) => !s.isActive)?.id ?? scenarios[0]?.id ?? "",
  );
  const [confirmSwitch, setConfirmSwitch] = useState(false);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const active = scenarios.find((s) => s.isActive);

  return (
    <section className="grid max-w-lg gap-4 rounded-xl border border-line/80 bg-surface p-5">
      <div>
        <h2 className="text-lg font-bold">検証シナリオ</h2>
        <p className="mt-1 text-sm text-muted">
          いまの収支をベースに複製し、同一アカウント内で本線と検証用を切替できます。昼食メニュー・メモ・給与PDF履歴はシナリオ共通です。
        </p>
      </div>

      <div className="rounded-lg border border-line/70 bg-white px-3 py-2 text-sm">
        現在:{" "}
        <span className="font-semibold text-accent-deep">
          {active?.name ?? "本線"}
        </span>
        {active && !active.isMain ? (
          <span className="ml-2 text-xs text-muted">（検証中）</span>
        ) : null}
      </div>

      <ul className="divide-y divide-line/70 overflow-hidden rounded-lg border border-line/70 bg-white">
        {scenarios.map((s) => (
          <li
            key={s.id}
            className="flex flex-wrap items-center gap-2 px-3 py-2.5 text-sm"
          >
            <div className="min-w-0 flex-1">
              {renameId === s.id ? (
                <form
                  className="flex flex-wrap gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    setError(null);
                    setMessage(null);
                    startTransition(async () => {
                      const res = await renameLedgerScenario(s.id, renameValue);
                      if (res?.error) {
                        setError(res.error);
                        return;
                      }
                      setRenameId(null);
                      setMessage("名前を変更しました");
                      router.refresh();
                    });
                  }}
                >
                  <input
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    className="min-w-0 flex-1 rounded-md border border-line px-2 py-1"
                    disabled={pending}
                  />
                  <button
                    type="submit"
                    disabled={pending}
                    className="text-xs text-accent hover:underline"
                  >
                    保存
                  </button>
                  <button
                    type="button"
                    onClick={() => setRenameId(null)}
                    className="text-xs text-muted hover:underline"
                  >
                    取消
                  </button>
                </form>
              ) : (
                <>
                  <p className="font-medium">
                    {s.name}
                    {s.isActive ? (
                      <span className="ml-2 text-xs font-normal text-accent">
                        使用中
                      </span>
                    ) : null}
                    {s.isMain ? (
                      <span className="ml-2 text-xs font-normal text-muted">
                        本線
                      </span>
                    ) : null}
                  </p>
                </>
              )}
            </div>
            {!s.isMain && renameId !== s.id ? (
              <button
                type="button"
                disabled={pending}
                className="text-xs text-muted hover:text-ink"
                onClick={() => {
                  setRenameId(s.id);
                  setRenameValue(s.name);
                }}
              >
                改名
              </button>
            ) : null}
            {!s.isMain && !s.isActive ? (
              <button
                type="button"
                disabled={pending}
                className="text-xs text-muted hover:text-expense"
                onClick={() => {
                  if (!window.confirm(`「${s.name}」を削除しますか？`)) return;
                  setError(null);
                  setMessage(null);
                  startTransition(async () => {
                    const res = await deleteLedgerScenario(s.id);
                    if (res?.error) {
                      setError(res.error);
                      return;
                    }
                    setMessage("削除しました");
                    if (selectedId === s.id) {
                      setSelectedId(
                        scenarios.find((x) => x.id !== s.id)?.id ?? "",
                      );
                    }
                    router.refresh();
                  });
                }}
              >
                削除
              </button>
            ) : null}
          </li>
        ))}
      </ul>

      <div className="grid gap-2 border-t border-line/70 pt-3">
        <label className="grid gap-1 text-sm">
          <span className="text-muted">現在から複製して切替</span>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="例: 検証A"
            className="rounded-md border border-line bg-white px-3 py-2"
            disabled={pending}
          />
        </label>
        <button
          type="button"
          disabled={pending || !newName.trim()}
          className="w-fit rounded-md bg-accent px-4 py-2.5 text-sm text-white hover:bg-accent-deep disabled:opacity-60"
          onClick={() => {
            setError(null);
            setMessage(null);
            startTransition(async () => {
              const res = await createLedgerScenario(newName);
              if (res?.error) {
                setError(res.error);
                return;
              }
              setMessage(`「${res.name}」を作成し切替ました`);
              setNewName("");
              router.refresh();
            });
          }}
        >
          {pending ? "処理中…" : "複製して切替"}
        </button>
      </div>

      {scenarios.some((s) => !s.isActive) ? (
        <div className="grid gap-3 border-t border-line/70 pt-3">
          <label className="grid gap-1 text-sm">
            <span className="text-muted">切替先シナリオ</span>
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="rounded-md border border-line bg-white px-3 py-2"
              disabled={pending}
            >
              {scenarios.map((s) => (
                <option key={s.id} value={s.id} disabled={s.isActive}>
                  {s.name}
                  {s.isActive ? "（使用中）" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-start gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={confirmSwitch}
              onChange={(e) => setConfirmSwitch(e.target.checked)}
              className="mt-1"
            />
            <span>
              現在の変更は今のシナリオに自動保存され、選択したシナリオの内容に置き換わることを理解しました
            </span>
          </label>
          <button
            type="button"
            disabled={
              pending ||
              !selectedId ||
              scenarios.find((s) => s.id === selectedId)?.isActive
            }
            className="w-fit rounded-md border border-line bg-white px-4 py-2.5 text-sm hover:bg-white disabled:opacity-60"
            onClick={() => {
              setError(null);
              setMessage(null);
              if (!confirmSwitch) {
                setError("切替する前に確認チェックを入れてください");
                return;
              }
              startTransition(async () => {
                const res = await switchLedgerScenario(selectedId);
                if (res?.error) {
                  setError(res.error);
                  return;
                }
                setMessage(`切替ました（${res.summary}）`);
                setConfirmSwitch(false);
                router.refresh();
              });
            }}
          >
            このシナリオへ切替
          </button>
        </div>
      ) : null}

      {error ? <p className="text-sm text-expense">{error}</p> : null}
      {message ? <p className="text-sm text-income">{message}</p> : null}
    </section>
  );
}
