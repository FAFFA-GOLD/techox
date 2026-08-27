"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createAccountTransfer,
  createAssetAccount,
  deleteAccountTransfer,
  deleteAssetAccount,
  upsertBalanceSnapshot,
} from "@/app/actions";
import { formatYen, type AccountEndingForecast } from "@/lib/money";
import { assetAccountKindLabel } from "@/lib/types";
import type {
  AccountBalanceSnapshot,
  AccountTransfer,
  AssetAccount,
  AssetAccountKind,
} from "@/lib/types";

type AccountPeriodStats = {
  expense: number;
  income: number;
};

type Props = {
  accounts: AssetAccount[];
  snapshots: AccountBalanceSnapshot[];
  latestByAccount: Record<string, AccountBalanceSnapshot | undefined>;
  periodStats: Record<string, AccountPeriodStats | undefined>;
  mainAccountId: string | null;
  totalAssets: number;
  totalAsOf: string | null;
  totalEnding: number;
  forecastByAccount: Record<string, AccountEndingForecast | undefined>;
  transfers: AccountTransfer[];
  today: string;
};

type Row = {
  account: AssetAccount;
  latest: AccountBalanceSnapshot | undefined;
  balance: number;
  share: number;
  income: number;
  expense: number;
  ending: number;
  asOf: string | null;
  appliedNet: number;
  movements: AccountEndingForecast["movements"];
};

const KINDS: { id: AssetAccountKind; label: string }[] = [
  { id: "bank", label: "銀行" },
  { id: "emoney", label: "電子マネー" },
  { id: "other", label: "その他" },
];

const KIND_BAR: Record<AssetAccountKind, string> = {
  bank: "bg-accent",
  emoney: "bg-amber-600",
  other: "bg-slate-500",
};

function isBankLike(kind: AssetAccountKind) {
  return kind !== "emoney";
}

export function AssetAccountsPanel({
  accounts,
  snapshots,
  latestByAccount,
  periodStats,
  mainAccountId,
  totalAssets,
  totalAsOf,
  totalEnding,
  forecastByAccount,
  transfers,
  today,
}: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [okMessage, setOkMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [localAccounts, setLocalAccounts] = useState(accounts);
  const [addFormKey, setAddFormKey] = useState(0);
  const [balanceFormKey, setBalanceFormKey] = useState(0);
  const [emoneyBalanceFormKey, setEmoneyBalanceFormKey] = useState(0);
  const [transferFormKey, setTransferFormKey] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(
    mainAccountId ?? accounts[0]?.id ?? null,
  );
  const bankAccounts = useMemo(
    () => localAccounts.filter((a) => isBankLike(a.kind)),
    [localAccounts],
  );
  const emoneyAccounts = useMemo(
    () => localAccounts.filter((a) => a.kind === "emoney"),
    [localAccounts],
  );
  const [balanceAccountId, setBalanceAccountId] = useState(
    () =>
      mainAccountId ??
      accounts.find((a) => isBankLike(a.kind))?.id ??
      "",
  );
  const [emoneyBalanceAccountId, setEmoneyBalanceAccountId] = useState(
    () => accounts.find((a) => a.kind === "emoney")?.id ?? "",
  );
  const [fromAccountId, setFromAccountId] = useState(
    mainAccountId ?? accounts[0]?.id ?? "",
  );
  const [toAccountId, setToAccountId] = useState(
    accounts.find((a) => a.id !== (mainAccountId ?? accounts[0]?.id))?.id ??
      accounts[1]?.id ??
      "",
  );

  useEffect(() => {
    setLocalAccounts(accounts);
  }, [accounts]);

  useEffect(() => {
    if (
      !balanceAccountId ||
      !bankAccounts.some((a) => a.id === balanceAccountId)
    ) {
      setBalanceAccountId(
        (mainAccountId && bankAccounts.some((a) => a.id === mainAccountId)
          ? mainAccountId
          : null) ??
          bankAccounts[0]?.id ??
          "",
      );
    }
  }, [bankAccounts, mainAccountId, balanceAccountId]);

  useEffect(() => {
    if (
      !emoneyBalanceAccountId ||
      !emoneyAccounts.some((a) => a.id === emoneyBalanceAccountId)
    ) {
      setEmoneyBalanceAccountId(emoneyAccounts[0]?.id ?? "");
    }
  }, [emoneyAccounts, emoneyBalanceAccountId]);

  useEffect(() => {
    if (!selectedId || !localAccounts.some((a) => a.id === selectedId)) {
      setSelectedId(mainAccountId ?? localAccounts[0]?.id ?? null);
    }
  }, [localAccounts, mainAccountId, selectedId]);

  const rows = useMemo(() => {
    return localAccounts.map((a) => {
      const latest = latestByAccount[a.id];
      const stats = periodStats[a.id] ?? { expense: 0, income: 0 };
      const forecast = forecastByAccount[a.id];
      const balance = latest?.balance ?? 0;
      const share =
        totalAssets > 0 && latest ? (balance / totalAssets) * 100 : 0;
      return {
        account: a,
        latest,
        balance,
        share,
        income: stats.income,
        expense: stats.expense,
        ending: forecast?.endingBalance ?? balance,
        asOf: forecast?.asOf ?? latest?.as_of_date ?? null,
        appliedNet: forecast?.appliedNet ?? 0,
        movements: forecast?.movements ?? [],
      } satisfies Row;
    });
  }, [
    localAccounts,
    latestByAccount,
    periodStats,
    totalAssets,
    forecastByAccount,
  ]);

  const bankRows = useMemo(
    () => rows.filter((r) => isBankLike(r.account.kind)),
    [rows],
  );
  const emoneyRows = useMemo(
    () => rows.filter((r) => r.account.kind === "emoney"),
    [rows],
  );

  const kindTotals = useMemo(() => {
    return KINDS.map((k) => {
      const subset = rows.filter((r) => r.account.kind === k.id);
      const balance = subset.reduce((s, r) => s + r.balance, 0);
      return { ...k, balance, count: subset.length };
    }).filter((k) => k.count > 0);
  }, [rows]);

  const selected = rows.find((r) => r.account.id === selectedId) ?? null;

  const bankSnapshots = useMemo(
    () =>
      snapshots.filter((s) => {
        const acc = localAccounts.find((a) => a.id === s.asset_account_id);
        return acc ? isBankLike(acc.kind) : true;
      }),
    [snapshots, localAccounts],
  );
  const emoneySnapshots = useMemo(
    () =>
      snapshots.filter((s) => {
        const acc = localAccounts.find((a) => a.id === s.asset_account_id);
        return acc?.kind === "emoney";
      }),
    [snapshots, localAccounts],
  );

  async function onCreate(fd: FormData) {
    setPending(true);
    setError(null);
    setOkMessage(null);
    try {
      const res = await createAssetAccount(fd);
      if (res?.error) {
        setError(res.error);
        return;
      }
      if (res?.account) {
        setLocalAccounts((prev) =>
          prev.some((a) => a.id === res.account!.id)
            ? prev
            : [...prev, res.account!],
        );
        setSelectedId(res.account.id);
        if (res.account.kind === "emoney") {
          setEmoneyBalanceAccountId(res.account.id);
        } else {
          setBalanceAccountId(res.account.id);
        }
      }
      setAddFormKey((k) => k + 1);
      setOkMessage("口座を追加しました");
      router.refresh();
    } catch {
      setError(
        "保存に失敗しました。supabase/migrations/015_asset_accounts.sql を実行済みか確認してください",
      );
    } finally {
      setPending(false);
    }
  }

  async function onUpsertBalance(fd: FormData) {
    setPending(true);
    setError(null);
    setOkMessage(null);
    try {
      const res = await upsertBalanceSnapshot(fd);
      if (res?.error) {
        setError(res.error);
        return;
      }
      setBalanceFormKey((k) => k + 1);
      setOkMessage("口座残高を保存しました");
      router.refresh();
    } catch {
      setError("残高の保存に失敗しました");
    } finally {
      setPending(false);
    }
  }

  async function onUpsertEmoneyBalance(fd: FormData) {
    setPending(true);
    setError(null);
    setOkMessage(null);
    try {
      const res = await upsertBalanceSnapshot(fd);
      if (res?.error) {
        setError(res.error);
        return;
      }
      setEmoneyBalanceFormKey((k) => k + 1);
      setOkMessage("電子マネー残高を保存しました");
      router.refresh();
    } catch {
      setError("残高の保存に失敗しました");
    } finally {
      setPending(false);
    }
  }

  async function onTransfer(fd: FormData) {
    setPending(true);
    setError(null);
    setOkMessage(null);
    try {
      const res = await createAccountTransfer(fd);
      if (res?.error) {
        setError(res.error);
        return;
      }
      setTransferFormKey((k) => k + 1);
      setOkMessage("振替を登録しました");
      router.refresh();
    } catch {
      setError(
        "振替の保存に失敗しました。supabase/migrations/016_account_transfers.sql を実行済みか確認してください",
      );
    } finally {
      setPending(false);
    }
  }

  async function onDeleteTransfer(id: string) {
    if (!window.confirm("この振替を削除しますか？")) return;
    setPending(true);
    setError(null);
    setOkMessage(null);
    try {
      const fd = new FormData();
      fd.set("id", id);
      const res = await deleteAccountTransfer(fd);
      if (res?.error) {
        setError(res.error);
        return;
      }
      setOkMessage("振替を削除しました");
      router.refresh();
    } catch {
      setError("振替の削除に失敗しました");
    } finally {
      setPending(false);
    }
  }

  async function onDelete(id: string, name: string) {
    if (
      !window.confirm(`「${name}」を削除しますか？（残高記録も消えます）`)
    ) {
      return;
    }
    setPending(true);
    setError(null);
    setOkMessage(null);
    try {
      const fd = new FormData();
      fd.set("id", id);
      const res = await deleteAssetAccount(fd);
      if (res?.error) {
        setError(res.error);
        return;
      }
      setLocalAccounts((prev) => prev.filter((a) => a.id !== id));
      setOkMessage("口座を削除しました");
      router.refresh();
    } catch {
      setError("削除に失敗しました");
    } finally {
      setPending(false);
    }
  }

  const accountName = (id: string) =>
    localAccounts.find((a) => a.id === id)?.name ?? "口座";

  function renderAccountTable(
    title: string,
    tableRows: Row[],
    emptyText: string,
    showFooter: boolean,
  ) {
    return (
      <div className="grid gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {tableRows.length === 0 ? (
          <p className="rounded-lg border border-line/70 bg-white/80 px-3 py-3 text-sm text-muted">
            {emptyText}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line/70 bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-line/70 bg-white/80 text-xs text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">名称</th>
                  <th className="px-3 py-2 text-right font-medium">実残高</th>
                  <th className="px-3 py-2 text-right font-medium">今期・入</th>
                  <th className="px-3 py-2 text-right font-medium">今期・出</th>
                  <th className="px-3 py-2 text-right font-medium">期末予定</th>
                  <th className="px-3 py-2 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line/50">
                {tableRows.map((r) => {
                  const active = selectedId === r.account.id;
                  return (
                    <tr
                      key={r.account.id}
                      className={`cursor-pointer ${
                        active ? "bg-accent/5" : "hover:bg-white/90"
                      }`}
                      onClick={() => setSelectedId(r.account.id)}
                    >
                      <td className="px-3 py-2.5">
                        <p className="font-medium">
                          {r.account.name}
                          {r.account.is_main ? (
                            <span className="ml-1.5 text-[10px] text-muted">
                              メイン
                            </span>
                          ) : null}
                        </p>
                        <p className="text-xs text-muted">
                          {assetAccountKindLabel(r.account.kind)}
                          {r.asOf ? ` · 基準 ${r.asOf}` : " · 残高未登録"}
                        </p>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-accent-deep">
                        {r.latest ? formatYen(r.balance) : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-income">
                        {r.income ? `+${formatYen(r.income)}` : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-expense">
                        {r.expense ? `−${formatYen(r.expense)}` : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-semibold">
                        {formatYen(r.ending)}
                        {r.appliedNet !== 0 ? (
                          <p className="text-[10px] font-normal text-muted">
                            以降 {r.appliedNet > 0 ? "+" : ""}
                            {formatYen(r.appliedNet)}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {!r.account.is_main ? (
                          <button
                            type="button"
                            disabled={pending}
                            className="text-xs text-muted hover:text-expense disabled:opacity-60"
                            onClick={(e) => {
                              e.stopPropagation();
                              void onDelete(r.account.id, r.account.name);
                            }}
                          >
                            削除
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {showFooter ? (
                <tfoot>
                  <tr className="border-t border-line/70 bg-white/90 text-sm font-medium">
                    <td className="px-3 py-2.5" colSpan={4}>
                      期末予定の合計 ＝ 全体の期末予測残高
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-accent-deep">
                      {formatYen(totalEnding)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
        )}
      </div>
    );
  }

  function renderSnapshotList(
    title: string,
    list: AccountBalanceSnapshot[],
  ) {
    if (list.length === 0) return null;
    return (
      <div className="grid gap-1">
        <p className="text-xs font-medium text-muted">{title}</p>
        <ul className="max-h-36 overflow-y-auto text-xs text-muted">
          {list.slice(0, 12).map((s) => {
            const acc = localAccounts.find((a) => a.id === s.asset_account_id);
            return (
              <li key={s.id} className="flex justify-between gap-2 py-0.5">
                <span>
                  {s.as_of_date} · {acc?.name ?? "口座"}
                  {s.note ? ` · ${s.note}` : ""}
                </span>
                <span className="tabular-nums text-ink">
                  {formatYen(s.balance)}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <section className="grid gap-5 rounded-xl border border-line/80 bg-surface p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">口座・電子マネー</h2>
          <p className="mt-1 text-sm text-muted">
            口座と電子マネーの実残高は総資産に含まれます。日々の残高確認は下の更新フォームから。
          </p>
        </div>
        <div className="flex flex-wrap gap-4 text-right">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted">
              総資産（いま）
            </p>
            <p className="text-xl font-bold tabular-nums text-accent-deep">
              {formatYen(totalAssets)}
            </p>
            <p className="text-xs text-muted">
              {totalAsOf
                ? "口座＋電子マネーの最新残高合計"
                : "残高未登録"}
            </p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted">
              期末予定（合計）
            </p>
            <p className="text-xl font-bold tabular-nums text-accent-deep">
              {formatYen(totalEnding)}
            </p>
            <p className="text-xs text-muted">各口座期末の合計</p>
          </div>
        </div>
      </div>

      <div className="grid gap-2 rounded-lg border border-line/70 bg-white/80 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="font-medium">総資産の内訳</span>
          <span className="text-xs text-muted">
            {kindTotals
              .map((k) => `${k.label} ${formatYen(k.balance)}`)
              .join(" ＋ ") || "残高なし"}
            {kindTotals.length > 0 ? ` ＝ ${formatYen(totalAssets)}` : ""}
          </span>
        </div>
        {totalAssets > 0 ? (
          <div className="flex h-3 overflow-hidden rounded-full bg-line/40">
            {rows
              .filter((r) => r.balance > 0)
              .map((r) => (
                <div
                  key={r.account.id}
                  title={`${r.account.name}: ${formatYen(r.balance)}（${r.share.toFixed(0)}%）`}
                  className={`${KIND_BAR[r.account.kind]} min-w-[2px]`}
                  style={{ width: `${r.share}%` }}
                />
              ))}
          </div>
        ) : (
          <div className="h-3 rounded-full bg-line/40" />
        )}
      </div>

      {renderAccountTable(
        "口座",
        bankRows,
        "銀行・その他の口座がありません。下の「口座・電子マネーを追加」から登録できます。",
        false,
      )}

      {renderAccountTable(
        "電子マネー",
        emoneyRows,
        "電子マネーがありません。下の「口座・電子マネーを追加」で種別「電子マネー」を選んで登録できます。残高は総資産に含まれます。",
        false,
      )}

      {bankRows.length + emoneyRows.length > 0 ? (
        <p className="text-xs text-muted">
          期末予定の合計 {formatYen(totalEnding)} ＝ 全体の期末予測残高
        </p>
      ) : null}

      <div className="grid gap-3 rounded-lg border border-line/70 bg-white/80 p-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold">
            この期の動き
            {selected ? (
              <span className="ml-2 font-normal text-muted">
                {assetAccountKindLabel(selected.account.kind)} ·{" "}
                {selected.account.name}
              </span>
            ) : null}
          </h3>
          {selected ? (
            <p className="text-xs text-muted">
              実残高 {selected.latest ? formatYen(selected.balance) : "未登録"}
              {selected.asOf ? `（${selected.asOf}）` : ""}
              {" → 期末予定 "}
              <span className="font-medium text-ink">
                {formatYen(selected.ending)}
              </span>
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {rows.map((r) => (
            <button
              key={r.account.id}
              type="button"
              onClick={() => setSelectedId(r.account.id)}
              className={`rounded-md px-2.5 py-1 text-xs ${
                selectedId === r.account.id
                  ? "bg-accent text-white"
                  : "border border-line bg-white text-muted"
              }`}
            >
              {r.account.name}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted">
          期間内の明細はすべて表示します。過ぎた日は淡く、「残高に含む」は計算から外しています（同日更新＝含み済み）。
        </p>
        {!selected || selected.movements.length === 0 ? (
          <p className="text-sm text-muted">
            この口座に紐づく今期の入出金はありません（未指定の明細はメイン口座扱い）。
          </p>
        ) : (
          <ul className="max-h-64 divide-y divide-line/50 overflow-y-auto text-sm">
            {selected.movements.map((m, i) => {
              const item = m.item;
              return (
                <li
                  key={`${item.id}-${i}`}
                  className={`flex items-start justify-between gap-3 py-1.5 ${
                    m.isPast ? "opacity-55" : ""
                  }`}
                >
                  <span className="min-w-0 text-muted">
                    <span className="tabular-nums text-ink/80">
                      {item.date.slice(5)}
                    </span>{" "}
                    {item.memo || item.category_name || "未分類"}
                    {item.isProjected ? (
                      <span className="ml-1 text-[10px] text-accent">予定</span>
                    ) : null}
                    {m.includedInBalance ? (
                      <span className="ml-1 text-[10px] text-muted">
                        残高に含む
                      </span>
                    ) : m.appliesToForecast ? (
                      <span className="ml-1 text-[10px] text-accent-deep">
                        計算中
                      </span>
                    ) : null}
                    {item.source === "transfer" ? (
                      <span className="ml-1 text-[10px] text-muted">振替</span>
                    ) : null}
                    {item.source === "card" || item.source === "loan" ? (
                      <span className="ml-1 text-[10px] text-muted">
                        {item.source === "card" ? "カード" : "ローン"}
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={`shrink-0 tabular-nums ${
                      item.kind === "income" ? "text-income" : "text-expense"
                    }`}
                  >
                    {item.kind === "income" ? "+" : "−"}
                    {formatYen(item.amount)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <form
        key={`bal-${balanceFormKey}`}
        className="grid gap-2 rounded-lg border border-line/70 bg-white/80 p-3 sm:grid-cols-4"
        action={onUpsertBalance}
      >
        <p className="sm:col-span-4 text-sm font-medium">口座残高を更新</p>
        <p className="sm:col-span-4 text-xs text-muted">
          収支のある日は、その日の出入りが終わったあとの残高を夜に更新してください。同じ日の収支は「残高に含む」となり、期末予定の計算からは外れます。
        </p>
        <select
          name="asset_account_id"
          value={balanceAccountId}
          onChange={(e) => setBalanceAccountId(e.target.value)}
          className="rounded-md border border-line px-3 py-2 text-sm sm:col-span-2"
        >
          {bankAccounts.map((a) => (
            <option key={a.id} value={a.id}>
              {assetAccountKindLabel(a.kind)} · {a.name}
            </option>
          ))}
        </select>
        <input
          name="as_of_date"
          type="date"
          required
          defaultValue={today}
          className="rounded-md border border-line px-3 py-2 text-sm"
        />
        <input
          name="balance"
          type="number"
          required
          placeholder="残高"
          className="rounded-md border border-line px-3 py-2 text-sm"
        />
        <input
          name="note"
          placeholder="メモ（任意）"
          className="rounded-md border border-line px-3 py-2 text-sm sm:col-span-3"
        />
        <button
          type="submit"
          disabled={pending || !balanceAccountId}
          className="rounded-md bg-accent px-3 py-2 text-sm text-white hover:bg-accent-deep disabled:opacity-60"
        >
          {pending ? "処理中…" : "保存"}
        </button>
      </form>
      {renderSnapshotList("直近の口座残高記録", bankSnapshots)}

      <form
        key={`emoney-bal-${emoneyBalanceFormKey}`}
        className="grid gap-2 rounded-lg border border-line/70 bg-white/80 p-3 sm:grid-cols-4"
        action={onUpsertEmoneyBalance}
      >
        <p className="sm:col-span-4 text-sm font-medium">電子マネー残高を更新</p>
        <p className="sm:col-span-4 text-xs text-muted">
          PayPay など、アプリで確認した残高をこまめに更新すると総資産が実態に近づきます。
        </p>
        <select
          name="asset_account_id"
          value={emoneyBalanceAccountId}
          onChange={(e) => setEmoneyBalanceAccountId(e.target.value)}
          className="rounded-md border border-line px-3 py-2 text-sm sm:col-span-2"
          disabled={emoneyAccounts.length === 0}
        >
          {emoneyAccounts.length === 0 ? (
            <option value="">電子マネー未登録</option>
          ) : (
            emoneyAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))
          )}
        </select>
        <input
          name="as_of_date"
          type="date"
          required
          defaultValue={today}
          className="rounded-md border border-line px-3 py-2 text-sm"
          disabled={emoneyAccounts.length === 0}
        />
        <input
          name="balance"
          type="number"
          required
          placeholder="残高"
          className="rounded-md border border-line px-3 py-2 text-sm"
          disabled={emoneyAccounts.length === 0}
        />
        <input
          name="note"
          placeholder="メモ（任意）"
          className="rounded-md border border-line px-3 py-2 text-sm sm:col-span-3"
          disabled={emoneyAccounts.length === 0}
        />
        <button
          type="submit"
          disabled={pending || !emoneyBalanceAccountId}
          className="rounded-md bg-accent px-3 py-2 text-sm text-white hover:bg-accent-deep disabled:opacity-60"
        >
          {pending ? "処理中…" : "保存"}
        </button>
      </form>
      {renderSnapshotList("直近の電子マネー残高記録", emoneySnapshots)}

      <form
        key={`transfer-${transferFormKey}`}
        className="grid gap-2 rounded-lg border border-line/70 bg-white/80 p-3 sm:grid-cols-6"
        action={onTransfer}
      >
        <p className="sm:col-span-6 text-sm font-medium">口座間振替</p>
        <p className="sm:col-span-6 text-xs text-muted">
          出金口座から入金口座へ移動します。手数料は出金側負担（既定 0
          円）。総資産は手数料ぶんだけ減ります。
        </p>
        <select
          name="from_asset_account_id"
          value={fromAccountId}
          onChange={(e) => setFromAccountId(e.target.value)}
          className="rounded-md border border-line px-3 py-2 text-sm sm:col-span-2"
        >
          {localAccounts.map((a) => (
            <option key={a.id} value={a.id}>
              出金 · {a.name}
            </option>
          ))}
        </select>
        <select
          name="to_asset_account_id"
          value={toAccountId}
          onChange={(e) => setToAccountId(e.target.value)}
          className="rounded-md border border-line px-3 py-2 text-sm sm:col-span-2"
        >
          {localAccounts.map((a) => (
            <option key={a.id} value={a.id}>
              入金 · {a.name}
            </option>
          ))}
        </select>
        <input
          name="date"
          type="date"
          required
          defaultValue={today}
          className="rounded-md border border-line px-3 py-2 text-sm"
        />
        <input
          name="amount"
          type="number"
          required
          min={1}
          placeholder="移動額"
          className="rounded-md border border-line px-3 py-2 text-sm"
        />
        <input
          name="fee_amount"
          type="number"
          min={0}
          defaultValue={0}
          placeholder="手数料"
          className="rounded-md border border-line px-3 py-2 text-sm"
        />
        <input
          name="memo"
          placeholder="メモ（任意）"
          className="rounded-md border border-line px-3 py-2 text-sm sm:col-span-4"
        />
        <button
          type="submit"
          disabled={pending || localAccounts.length < 2}
          className="rounded-md bg-accent px-3 py-2 text-sm text-white hover:bg-accent-deep disabled:opacity-60 sm:col-span-2"
        >
          {pending ? "処理中…" : "振替を登録"}
        </button>
      </form>

      {transfers.length > 0 ? (
        <div className="grid gap-1">
          <p className="text-xs font-medium text-muted">今期の振替</p>
          <ul className="max-h-36 overflow-y-auto text-xs text-muted">
            {transfers.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between gap-2 py-0.5"
              >
                <span>
                  {t.date} · {accountName(t.from_asset_account_id)} →{" "}
                  {accountName(t.to_asset_account_id)}
                  {" · "}
                  {formatYen(t.amount)}
                  {t.fee_amount > 0
                    ? `（手数料 ${formatYen(t.fee_amount)}）`
                    : ""}
                  {t.memo ? ` · ${t.memo}` : ""}
                </span>
                <button
                  type="button"
                  disabled={pending}
                  className="shrink-0 text-muted hover:text-expense disabled:opacity-60"
                  onClick={() => void onDeleteTransfer(t.id)}
                >
                  削除
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <form
        key={`add-${addFormKey}`}
        className="grid gap-2 rounded-lg border border-line/70 bg-white/80 p-3 sm:grid-cols-4"
        action={onCreate}
      >
        <p className="sm:col-span-4 text-sm font-medium">口座・電子マネーを追加</p>
        <input
          name="name"
          required
          placeholder="例: PayPay / ゆうちょ"
          className="rounded-md border border-line px-3 py-2 text-sm sm:col-span-2"
        />
        <select
          name="kind"
          defaultValue="bank"
          className="rounded-md border border-line px-3 py-2 text-sm"
        >
          {KINDS.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-accent px-3 py-2 text-sm text-white hover:bg-accent-deep disabled:opacity-60"
        >
          {pending ? "処理中…" : "追加"}
        </button>
      </form>

      {okMessage ? (
        <p className="text-sm text-income">{okMessage}</p>
      ) : null}
      {error ? <p className="text-sm text-expense">{error}</p> : null}
    </section>
  );
}
