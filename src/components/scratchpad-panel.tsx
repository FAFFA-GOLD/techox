"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { saveDailyScratchpad } from "@/app/actions";
import { formatYen } from "@/lib/money";
import { evalArithmetic, fillMemoCalculations } from "@/lib/scratchpad-calc";

type Props = {
  monthKey: string;
  initialBody: string;
};

export function ScratchpadPanel({ monthKey, initialBody }: Props) {
  const [body, setBody] = useState(initialBody);
  const [unit, setUnit] = useState("");
  const [qty, setQty] = useState("");
  const [expr, setExpr] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setBody(initialBody);
    setMessage(null);
    setError(null);
  }, [initialBody]);

  const unitResult = useMemo(() => {
    const u = evalArithmetic(unit);
    const q = evalArithmetic(qty);
    if (u == null || q == null) return null;
    return Math.round(u * q);
  }, [unit, qty]);

  const exprResult = useMemo(() => evalArithmetic(expr), [expr]);

  function appendCalcLine(line: string) {
    setBody((prev) => {
      const next = prev.trimEnd();
      return next ? `${next}\n${line}` : line;
    });
  }

  return (
    <section className="grid gap-3 rounded-xl border border-line/80 bg-white/60 p-4">
      <div>
        <h2 className="text-base font-bold">メモ・計算</h2>
        <p className="mt-1 text-xs text-muted">
          全月共通のメモ帳です。一度保存すれば、翌月以降も同じ内容が表示されます。
          安い昼食・酒の単価など自由に書けます。行末を「=」にして「行を計算」で金額を出せます。
        </p>
      </div>

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={7}
        placeholder={
          "例:\nランチ 定食A 580円（駅前）\n缶ビール 98円 × 2本 × 30日 =\n雑酒 1本あたり 120円 × 20日 ="
        }
        className="w-full resize-y rounded-md border border-line bg-white px-3 py-2 text-sm leading-relaxed"
      />

      <div className="grid gap-2 rounded-lg border border-line/60 bg-surface/80 p-3">
        <p className="text-xs font-medium text-muted">かんたん計算（単価 × 回数）</p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="grid gap-1 text-xs">
            <span className="text-muted">単価</span>
            <input
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              inputMode="decimal"
              placeholder="98"
              className="w-24 rounded-md border border-line bg-white px-2 py-1.5 text-sm tabular-nums"
            />
          </label>
          <span className="pb-2 text-muted">×</span>
          <label className="grid gap-1 text-xs">
            <span className="text-muted">回数・日数</span>
            <input
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              inputMode="decimal"
              placeholder="30"
              className="w-24 rounded-md border border-line bg-white px-2 py-1.5 text-sm tabular-nums"
            />
          </label>
          <span className="pb-2 text-muted">=</span>
          <p className="pb-1.5 text-sm font-semibold tabular-nums text-expense">
            {unitResult != null ? formatYen(unitResult) : "—"}
          </p>
          <button
            type="button"
            disabled={unitResult == null}
            className="rounded-md border border-line bg-white px-2.5 py-1.5 text-xs disabled:opacity-50"
            onClick={() => {
              if (unitResult == null) return;
              appendCalcLine(
                `${unit.trim()} × ${qty.trim()} = ${unitResult}`,
              );
            }}
          >
            メモへ追加
          </button>
        </div>

        <label className="mt-1 grid gap-1 text-xs">
          <span className="text-muted">式（例: 98*2*30 や (580-100)*20）</span>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={expr}
              onChange={(e) => setExpr(e.target.value)}
              placeholder="98*2*30"
              className="min-w-[10rem] flex-1 rounded-md border border-line bg-white px-2 py-1.5 text-sm tabular-nums"
            />
            <span className="text-sm font-semibold tabular-nums text-expense">
              {exprResult != null ? formatYen(Math.round(exprResult)) : "—"}
            </span>
            <button
              type="button"
              disabled={exprResult == null}
              className="rounded-md border border-line bg-white px-2.5 py-1.5 text-xs disabled:opacity-50"
              onClick={() => {
                if (exprResult == null) return;
                appendCalcLine(
                  `${expr.trim()} = ${Math.round(exprResult)}`,
                );
              }}
            >
              メモへ追加
            </button>
          </div>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="rounded-md border border-line bg-white px-3 py-2 text-sm"
          onClick={() => setBody((b) => fillMemoCalculations(b))}
        >
          行を計算（末尾 =）
        </button>
        <button
          type="button"
          disabled={pending}
          className="rounded-md bg-accent px-3 py-2 text-sm text-white hover:bg-accent-deep disabled:opacity-60"
          onClick={() => {
            setError(null);
            setMessage(null);
            startTransition(async () => {
              const res = await saveDailyScratchpad(monthKey, body);
              if (res?.error) {
                setError(res.error);
                return;
              }
              setMessage("保存しました");
            });
          }}
        >
          {pending ? "保存中…" : "メモを保存"}
        </button>
        {message ? <span className="text-sm text-income">{message}</span> : null}
        {error ? <span className="text-sm text-expense">{error}</span> : null}
      </div>
    </section>
  );
}
