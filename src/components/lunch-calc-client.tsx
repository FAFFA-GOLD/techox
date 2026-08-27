"use client";

import { Fragment, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createLunchMenuItem,
  deleteLunchMenuItem,
  moveLunchMenuItem,
  updateLunchMenuItem,
} from "@/app/actions";
import { formatYen } from "@/lib/money";
import {
  defaultLunchBandPercents,
  lunchPriceBand,
  lunchPriceBandLabel,
  planLunchBandDays,
  simulateLunchMonthTotal,
  type LunchBandDayPlanRow,
} from "@/lib/lunch-calc";
import type { LunchMenuItem } from "@/lib/types";

type Props = {
  initialItems: LunchMenuItem[];
};

type SortMode = "manual" | "amountAsc" | "amountDesc" | "byStore";

const BAND_PREFS_KEY = "techoox-lunch-band-prefs";

type SavedBandPrefs = {
  bandPercents: Record<string, number>;
  days?: number;
};

function loadSavedBandPrefs(): SavedBandPrefs | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(BAND_PREFS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SavedBandPrefs;
  } catch {
    return null;
  }
}

function mergeBandPercents(
  items: LunchMenuItem[],
  saved: Record<string, number> | null,
): Record<number, number> {
  const defaults = defaultLunchBandPercents(items);
  if (!saved) return defaults;
  const next: Record<number, number> = {};
  for (const key of Object.keys(defaults)) {
    const band = Number(key);
    const fromSaved = saved[String(band)];
    next[band] = fromSaved != null ? fromSaved : defaults[band];
  }
  return next;
}

export function LunchCalcClient({ initialItems }: Props) {
  const router = useRouter();
  const [sortMode, setSortMode] = useState<SortMode>("manual");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [bandPercents, setBandPercents] = useState<Record<number, number>>(
    () => defaultLunchBandPercents(initialItems),
  );
  const [days, setDays] = useState(22);
  const [planDays, setPlanDays] = useState(22);
  const [targetAmount, setTargetAmount] = useState(19000);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [simTotal, setSimTotal] = useState<number | null>(null);
  const [simBandRows, setSimBandRows] = useState<
    { band: number; count: number; sum: number }[]
  >([]);
  const [planRows, setPlanRows] = useState<LunchBandDayPlanRow[]>([]);
  const [planTotal, setPlanTotal] = useState<number | null>(null);
  const [planNote, setPlanNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const saved = loadSavedBandPrefs();
    if (saved) {
      setBandPercents(mergeBandPercents(initialItems, saved.bandPercents));
      if (saved.days && saved.days > 0) setDays(saved.days);
    } else {
      setBandPercents(defaultLunchBandPercents(initialItems));
    }
    setPrefsLoaded(true);
    // 初回マウントのみ保存値を読む
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!prefsLoaded) return;
    setBandPercents((prev) => {
      const bandsNow = [
        ...new Set(initialItems.map((i) => lunchPriceBand(i.amount))),
      ];
      const next: Record<number, number> = {};
      let changed = false;
      for (const b of bandsNow) {
        if (prev[b] == null) {
          changed = true;
          next[b] = 0;
        } else {
          next[b] = prev[b];
        }
      }
      for (const key of Object.keys(prev)) {
        if (!bandsNow.includes(Number(key))) changed = true;
      }
      return changed ? next : prev;
    });
  }, [initialItems, prefsLoaded]);

  const displayItems = useMemo(() => {
    const rows = [...initialItems];
    if (sortMode === "amountAsc") {
      rows.sort((a, b) => a.amount - b.amount || a.sort_order - b.sort_order);
    } else if (sortMode === "amountDesc") {
      rows.sort((a, b) => b.amount - a.amount || a.sort_order - b.sort_order);
    } else if (sortMode === "byStore") {
      rows.sort(
        (a, b) =>
          a.store_name.localeCompare(b.store_name, "ja") ||
          a.amount - b.amount ||
          a.item_name.localeCompare(b.item_name, "ja") ||
          a.sort_order - b.sort_order,
      );
    }
    return rows;
  }, [initialItems, sortMode]);

  const storeGroups = useMemo(() => {
    if (sortMode !== "byStore") return null;
    const groups: { store: string; items: LunchMenuItem[] }[] = [];
    for (const item of displayItems) {
      const last = groups[groups.length - 1];
      if (last && last.store === item.store_name) {
        last.items.push(item);
      } else {
        groups.push({ store: item.store_name, items: [item] });
      }
    }
    return groups;
  }, [displayItems, sortMode]);

  const bands = useMemo(() => {
    const set = new Set(initialItems.map((i) => lunchPriceBand(i.amount)));
    return [...set].sort((a, b) => a - b);
  }, [initialItems]);

  const percentSum = bands.reduce((s, b) => s + (bandPercents[b] ?? 0), 0);
  const percentRemain = 100 - percentSum;

  function runAction(
    action: (fd: FormData) => Promise<{ error?: string; ok?: true }>,
    fd: FormData,
  ) {
    startTransition(async () => {
      const res = await action(fd);
      setError(res?.error ?? null);
      if (!res?.error) {
        setEditingId(null);
        router.refresh();
      }
    });
  }

  function ensureBandDefaults(nextItems: LunchMenuItem[]) {
    setBandPercents((prev) => {
      const nextBands = [
        ...new Set(nextItems.map((i) => lunchPriceBand(i.amount))),
      ];
      const missing = nextBands.filter((b) => prev[b] == null);
      if (missing.length === 0 && nextBands.every((b) => b in prev)) return prev;
      return defaultLunchBandPercents(nextItems);
    });
  }

  return (
    <div className="grid gap-6">
      <section className="grid gap-3 rounded-xl border border-line/80 bg-surface p-4">
        <h2 className="text-lg font-bold">メニューを追加</h2>
        <p className="text-sm text-muted">
          店・名称・金額を登録すると、最安比較や価格帯ごとの候補整理に使えます。
        </p>
        <form
          className="grid gap-2 sm:grid-cols-4"
          action={(fd) => {
            runAction(createLunchMenuItem, fd);
            ensureBandDefaults([
              ...initialItems,
              {
                id: "tmp",
                user_id: "",
                store_name: String(fd.get("store_name") ?? ""),
                item_name: String(fd.get("item_name") ?? ""),
                amount: Number(fd.get("amount") ?? 0),
                sort_order: 0,
                created_at: "",
                updated_at: "",
              },
            ]);
          }}
        >
          <label className="grid min-w-0 gap-1 text-sm sm:col-span-1">
            <span className="text-muted">店</span>
            <input
              name="store_name"
              required
              className="w-full min-w-0 rounded-md border border-line bg-white px-3 py-2"
              placeholder="例: 駅前定食"
            />
          </label>
          <label className="grid min-w-0 gap-1 text-sm sm:col-span-1">
            <span className="text-muted">名称</span>
            <input
              name="item_name"
              required
              className="w-full min-w-0 rounded-md border border-line bg-white px-3 py-2"
              placeholder="例: 日替わり定食"
            />
          </label>
          <label className="grid min-w-0 gap-1 text-sm">
            <span className="text-muted">金額（円）</span>
            <input
              name="amount"
              type="number"
              min={1}
              required
              className="w-full min-w-0 rounded-md border border-line bg-white px-3 py-2"
              placeholder="580"
            />
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-md bg-accent px-4 py-2 text-sm text-white hover:bg-accent-deep disabled:opacity-60"
            >
              {pending ? "追加中…" : "追加"}
            </button>
          </div>
        </form>
        {error ? <p className="text-sm text-expense">{error}</p> : null}
      </section>

      <section className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold">登録メニュー</h2>
          <div className="flex flex-wrap gap-1">
            {(
              [
                ["manual", "手動順"],
                ["amountAsc", "安い順"],
                ["amountDesc", "高い順"],
                ["byStore", "店別"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setSortMode(id)}
                className={`rounded-md px-2.5 py-1 text-xs ${
                  sortMode === id
                    ? "bg-accent text-white"
                    : "border border-line bg-white/80 text-muted"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {displayItems.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line bg-white/50 px-4 py-8 text-center text-sm text-muted">
            まだメニューがありません。上から追加してください。
          </p>
        ) : (
          <ul className="divide-y divide-line/70 overflow-hidden rounded-xl border border-line/80 bg-surface">
            {displayItems.map((item, index) => {
              const band = lunchPriceBand(item.amount);
              const editing = editingId === item.id;
              const showStoreHeader =
                sortMode === "byStore" &&
                (index === 0 ||
                  displayItems[index - 1].store_name !== item.store_name);
              const storeItemCount =
                sortMode === "byStore" && storeGroups
                  ? (storeGroups.find((g) => g.store === item.store_name)?.items
                      .length ?? 0)
                  : 0;
              return (
                <Fragment key={item.id}>
                  {showStoreHeader ? (
                    <li className="flex flex-wrap items-baseline justify-between gap-2 bg-[#eef5f3] px-4 py-2">
                      <p className="text-sm font-bold text-accent-deep">
                        {item.store_name}
                      </p>
                      <p className="text-xs text-muted">
                        {storeItemCount}件 · 店内最安{" "}
                        <span className="font-semibold tabular-nums text-expense">
                          {formatYen(item.amount)}
                        </span>
                      </p>
                    </li>
                  ) : null}
                  <li className="grid gap-2 px-4 py-3">
                    {editing ? (
                      <form
                        className="grid gap-2 sm:grid-cols-4"
                        action={(fd) => runAction(updateLunchMenuItem, fd)}
                      >
                        <input type="hidden" name="id" value={item.id} />
                        <input
                          name="store_name"
                          defaultValue={item.store_name}
                          className="rounded-md border border-line bg-white px-2 py-1.5 text-sm"
                        />
                        <input
                          name="item_name"
                          defaultValue={item.item_name}
                          className="rounded-md border border-line bg-white px-2 py-1.5 text-sm"
                        />
                        <input
                          name="amount"
                          type="number"
                          min={1}
                          defaultValue={item.amount}
                          className="rounded-md border border-line bg-white px-2 py-1.5 text-sm"
                        />
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="submit"
                            className="rounded-md bg-accent px-3 py-1.5 text-xs text-white"
                          >
                            保存
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="rounded-md border border-line px-3 py-1.5 text-xs text-muted"
                          >
                            取消
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">
                            {sortMode === "byStore"
                              ? item.item_name
                              : `${item.store_name} · ${item.item_name}`}
                          </p>
                          <p className="text-xs text-muted">
                            {lunchPriceBandLabel(band)}
                          </p>
                        </div>
                        <p className="tabular-nums text-sm font-semibold text-expense">
                          {formatYen(item.amount)}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {sortMode === "manual" ? (
                            <>
                              <form
                                action={(fd) => runAction(moveLunchMenuItem, fd)}
                              >
                                <input type="hidden" name="id" value={item.id} />
                                <input type="hidden" name="direction" value="up" />
                                <button
                                  type="submit"
                                  disabled={pending || index === 0}
                                  className="text-xs text-muted hover:text-ink disabled:opacity-40"
                                >
                                  ↑
                                </button>
                              </form>
                              <form
                                action={(fd) => runAction(moveLunchMenuItem, fd)}
                              >
                                <input type="hidden" name="id" value={item.id} />
                                <input
                                  type="hidden"
                                  name="direction"
                                  value="down"
                                />
                                <button
                                  type="submit"
                                  disabled={
                                    pending || index === displayItems.length - 1
                                  }
                                  className="text-xs text-muted hover:text-ink disabled:opacity-40"
                                >
                                  ↓
                                </button>
                              </form>
                            </>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => setEditingId(item.id)}
                            className="text-xs text-accent hover:underline"
                          >
                            編集
                          </button>
                          <form
                            action={(fd) => runAction(deleteLunchMenuItem, fd)}
                          >
                            <input type="hidden" name="id" value={item.id} />
                            <button
                              type="submit"
                              className="text-xs text-muted hover:text-expense"
                            >
                              削除
                            </button>
                          </form>
                        </div>
                      </div>
                    )}
                  </li>
                </Fragment>
              );
            })}
          </ul>
        )}
      </section>

      <section className="grid gap-6 rounded-xl border border-line/80 bg-surface p-4">
        <div>
          <h2 className="text-lg font-bold">月間の昼食目安</h2>
          <p className="mt-1 text-sm text-muted">
            下の2つは別ツールです。希望額の構成調べは比率と無関係、ランダム予想は比率だけで合計の目安を出します。
          </p>
        </div>

        <div className="grid gap-3 border-t border-line/70 pt-4">
          <div>
            <h3 className="text-sm font-bold text-ink">希望額の価格帯構成</h3>
            <p className="mt-1 text-xs text-muted">
              日数と希望合計だけから、希望に近く下回る価格帯の日数構成をランダムに作ります。押すたびに構成が変わります（下の比率・ランダム予想には影響しません）。
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 sm:items-end">
            <label className="grid max-w-xs gap-1 text-sm">
              <span className="text-muted">日数</span>
              <input
                type="number"
                min={1}
                max={31}
                value={planDays}
                onChange={(e) => setPlanDays(Number(e.target.value) || 0)}
                className="rounded-md border border-line bg-white px-3 py-2"
              />
            </label>
            <label className="grid max-w-xs gap-1 text-sm">
              <span className="text-muted">希望合計金額（円）</span>
              <input
                type="number"
                min={1}
                step={100}
                value={targetAmount}
                onChange={(e) => setTargetAmount(Number(e.target.value) || 0)}
                className="rounded-md border border-line bg-white px-3 py-2"
              />
            </label>
          </div>

          <button
            type="button"
            disabled={
              initialItems.length === 0 || planDays <= 0 || targetAmount <= 0
            }
            onClick={() => {
              const plan = planLunchBandDays(
                initialItems,
                planDays,
                targetAmount,
              );
              setPlanRows(plan.rows);
              setPlanTotal(plan.total);
              if (plan.rows.length === 0) {
                setPlanNote("メニューがありません");
                return;
              }
              if (plan.bandOptionCount <= 1) {
                setPlanNote(
                  "登録メニューの価格帯が1種類だけなので、構成もその帯のみになります。ほかの価格帯のメニューを追加すると組み合わせできます。",
                );
                return;
              }
              if (plan.minTotal > targetAmount) {
                setPlanNote(
                  `最安構成でも目安 ${formatYen(plan.minTotal)} となり、希望 ${formatYen(targetAmount)} を下回れません。最安の構成を表示しています。`,
                );
                return;
              }
              if (plan.total === plan.maxTotal && plan.maxTotal < targetAmount) {
                setPlanNote(
                  `登録メニューの最高帯まで使っても目安 ${formatYen(plan.maxTotal)} です（希望 ${formatYen(targetAmount)}）。`,
                );
                return;
              }
              const diff = targetAmount - plan.total;
              setPlanNote(
                diff === 0
                  ? "希望額ちょうどになる構成です（押すたびに別パターンも出せます／各帯は登録メニュー平均単価）。"
                  : `希望より ${formatYen(diff)} 控えめの構成です。もう一度押すと別の組み合わせになります（各帯は登録メニュー平均単価）。`,
              );
            }}
            className="w-fit rounded-md border border-accent/40 bg-white px-4 py-2 text-sm text-accent-deep hover:bg-white disabled:opacity-60"
          >
            価格帯の構成をランダムに出す
          </button>
        </div>

        {planTotal != null && planRows.length > 0 ? (
          <div className="rounded-lg border border-line/70 bg-white/80 px-3 py-2">
            <p className="text-xs font-medium text-muted">
              希望に近い価格帯の日数構成（ランダム）
            </p>
            <p className="mt-1 text-sm">
              構成合計目安{" "}
              <span className="text-lg font-bold tabular-nums text-expense">
                {formatYen(planTotal)}
              </span>
              <span className="ml-2 text-xs text-muted">
                （希望 {formatYen(targetAmount)} / {planDays}日）
              </span>
            </p>
            <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
              {planRows.map((row) => (
                <li
                  key={row.band}
                  className="flex items-baseline justify-between gap-2 text-sm"
                >
                  <span>
                    {lunchPriceBandLabel(row.band)}{" "}
                    <span className="font-semibold tabular-nums text-ink">
                      {row.days}日
                    </span>
                    <span className="text-xs text-muted">
                      {" "}
                      · 単価目安 {formatYen(row.avgUnit)}
                    </span>
                  </span>
                  <span className="tabular-nums text-expense">
                    {formatYen(row.sum)}
                  </span>
                </li>
              ))}
            </ul>
            {planNote ? (
              <p className="mt-2 text-[11px] text-muted">{planNote}</p>
            ) : null}
          </div>
        ) : null}

        <div className="grid gap-3 border-t border-line/70 pt-4">
          <div>
            <h3 className="text-sm font-bold text-ink">比率ランダム予想</h3>
            <p className="mt-1 text-xs text-muted">
              価格帯の比率に従って毎日ランダムに選んだ想定で、合計がどれくらいになるかの目安です（上の希望額構成とは連動しません）。
            </p>
          </div>

          <label className="grid max-w-xs gap-1 text-sm">
            <span className="text-muted">月間日数（昼食をとる日数）</span>
            <input
              type="number"
              min={1}
              max={31}
              value={days}
              onChange={(e) => setDays(Number(e.target.value) || 0)}
              className="rounded-md border border-line bg-white px-3 py-2"
            />
          </label>

          {bands.length === 0 ? (
            <p className="text-sm text-muted">
              メニューを登録すると価格帯の比率を設定できます。
            </p>
          ) : (
          <div className="grid gap-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-xs font-medium text-muted">
                価格帯の比率（合計{" "}
                <span
                  className={`tabular-nums font-semibold ${
                    percentSum === 100
                      ? "text-income"
                      : percentSum > 100
                        ? "text-expense"
                        : "text-ink"
                  }`}
                >
                  {percentSum}%
                </span>
                ）
              </p>
              <p
                className={`text-xs tabular-nums ${
                  percentRemain === 0
                    ? "text-income"
                    : percentRemain < 0
                      ? "text-expense"
                      : "text-muted"
                }`}
              >
                {percentRemain === 0
                  ? "ちょうど100%です"
                  : percentRemain > 0
                    ? `100%まであと ${percentRemain}%`
                    : `100%を ${Math.abs(percentRemain)}% 超過`}
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {bands.map((band) => (
                <label
                  key={band}
                  className="flex items-center justify-between gap-2 rounded-md border border-line/70 bg-white/80 px-3 py-2 text-sm"
                >
                  <span>{lunchPriceBandLabel(band)}</span>
                  <span className="flex items-center gap-1">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={bandPercents[band] ?? 0}
                      onChange={(e) => {
                        setSaveMessage(null);
                        setBandPercents((prev) => ({
                          ...prev,
                          [band]: Number(e.target.value) || 0,
                        }));
                      }}
                      className="w-16 rounded-md border border-line px-2 py-1 text-right tabular-nums"
                    />
                    <span className="text-muted">%</span>
                  </span>
                </label>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  const payload: SavedBandPrefs = {
                    bandPercents: Object.fromEntries(
                      Object.entries(bandPercents).map(([k, v]) => [k, v]),
                    ),
                    days,
                  };
                  window.localStorage.setItem(
                    BAND_PREFS_KEY,
                    JSON.stringify(payload),
                  );
                  setSaveMessage(
                    percentSum === 100
                      ? "比率と日数を保存しました"
                      : `保存しました（合計 ${percentSum}% ※100%推奨）`,
                  );
                }}
                className="rounded-md border border-line bg-white px-3 py-1.5 text-xs text-ink hover:bg-white"
              >
                この比率を記憶
              </button>
              <button
                type="button"
                onClick={() => {
                  setSaveMessage(null);
                  setBandPercents(defaultLunchBandPercents(initialItems));
                }}
                className="text-xs text-accent hover:underline"
              >
                比率を均等に戻す
              </button>
              {percentRemain !== 0 && bands.length > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    setSaveMessage(null);
                    const last = bands[bands.length - 1];
                    setBandPercents((prev) => {
                      const others = bands
                        .filter((b) => b !== last)
                        .reduce((s, b) => s + (prev[b] ?? 0), 0);
                      return {
                        ...prev,
                        [last]: Math.max(0, 100 - others),
                      };
                    });
                  }}
                  className="text-xs text-muted hover:text-ink hover:underline"
                >
                  残りを最終帯に合わせて100%にする
                </button>
              ) : null}
              {saveMessage ? (
                <span className="text-xs text-income">{saveMessage}</span>
              ) : null}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={initialItems.length === 0 || days <= 0}
            onClick={() => {
              const { total, bandCounts, bandSums } = simulateLunchMonthTotal(
                initialItems,
                days,
                bandPercents,
              );
              setSimTotal(total);
              const rows = Object.keys(bandCounts)
                .map(Number)
                .sort((a, b) => a - b)
                .map((band) => ({
                  band,
                  count: bandCounts[band] ?? 0,
                  sum: bandSums[band] ?? 0,
                }));
              setSimBandRows(rows);
            }}
            className="rounded-md bg-accent px-4 py-2 text-sm text-white hover:bg-accent-deep disabled:opacity-60"
          >
            ランダム予想を計算
          </button>
          {simTotal != null ? (
            <p className="text-sm">
              予想合計{" "}
              <span className="text-lg font-bold tabular-nums text-expense">
                {formatYen(simTotal)}
              </span>
              <span className="ml-2 text-xs text-muted">
                （{days}日 / 1日平均{" "}
                {formatYen(Math.round(simTotal / Math.max(days, 1)))}）
              </span>
            </p>
          ) : null}
        </div>
        {simBandRows.length > 0 ? (
          <div className="rounded-lg border border-line/70 bg-white/80 px-3 py-2">
            <p className="text-xs font-medium text-muted">
              今回の抽選内訳（押すたびに変わります）
            </p>
            <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
              {simBandRows.map((row) => (
                <li
                  key={row.band}
                  className="flex items-baseline justify-between gap-2 text-sm"
                >
                  <span>
                    {lunchPriceBandLabel(row.band)}{" "}
                    <span className="font-semibold tabular-nums text-ink">
                      {row.count}回
                    </span>
                    <span className="text-xs text-muted">
                      {" "}
                      / {days}日中
                    </span>
                  </span>
                  <span className="tabular-nums text-expense">
                    {formatYen(row.sum)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-muted">
              例: 900円代が4回なら、その月は900円帯の昼食を4日想定した計算です。
            </p>
          </div>
        ) : null}
        </div>
      </section>
    </div>
  );
}
