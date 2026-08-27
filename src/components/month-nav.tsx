"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { shiftPeriod } from "@/lib/money";
import type { PeriodKey, PeriodRange } from "@/lib/types";

type Props = {
  period: PeriodRange;
  basePath: string;
  /** 例: /api/export/period?period=2026-06 */
  exportHref?: string;
  /** period 以外に維持したいクエリ（例: months=24） */
  keepQuery?: Record<string, string>;
};

function buildHref(
  basePath: string,
  periodKey: string,
  keepQuery?: Record<string, string>,
): string {
  const p = new URLSearchParams(keepQuery ?? {});
  p.set("period", periodKey);
  return `${basePath}?${p.toString()}`;
}

/** 前月／次月。タッチでも押しやすい大きめのヒット領域 */
export const periodNavButtonClassName =
  "relative z-10 inline-flex h-12 min-w-[6.75rem] shrink-0 touch-manipulation select-none items-center justify-center rounded-lg border border-line bg-white px-4 text-sm font-medium text-muted shadow-sm hover:bg-white hover:text-ink active:bg-line/50 sm:h-14 sm:min-w-[8rem] sm:px-5 sm:text-base";

export function PeriodNav({
  period,
  basePath,
  exportHref,
  keepQuery,
}: Props) {
  const router = useRouter();
  const prev = shiftPeriod(period.key, -1);
  const next = shiftPeriod(period.key, 1);

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 sm:gap-4">
        <Link
          href={buildHref(basePath, prev, keepQuery)}
          aria-label="前の期間へ"
          className={periodNavButtonClassName}
        >
          ← 前月
        </Link>
        <div className="min-w-0 overflow-hidden text-center pointer-events-none">
          <h1 className="truncate text-lg font-bold tracking-tight sm:text-2xl">
            {period.label}
          </h1>
          <p className="truncate text-xs text-muted">
            給料日 {period.payday} 〜 次給料前日 {period.end}
          </p>
        </div>
        <Link
          href={buildHref(basePath, next, keepQuery)}
          aria-label="次の期間へ"
          className={periodNavButtonClassName}
        >
          次月 →
        </Link>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <label className="flex items-center gap-2 text-sm text-muted">
          <span>年月へ移動</span>
          <input
            type="month"
            value={period.key}
            onChange={(e) => {
              const value = e.target.value;
              if (!value) return;
              router.push(buildHref(basePath, value as PeriodKey, keepQuery));
            }}
            className="rounded-md border border-line bg-white px-2.5 py-1.5 text-sm text-ink"
          />
        </label>
        {exportHref ? (
          <a
            href={exportHref}
            className="rounded-md border border-line bg-white/80 px-3 py-1.5 text-sm text-muted hover:text-ink"
          >
            CSV出力
          </a>
        ) : null}
      </div>
    </div>
  );
}

/** @deprecated */
export function MonthNav({
  month,
  basePath,
}: {
  month: PeriodKey;
  basePath: string;
}) {
  return (
    <PeriodNav
      period={{
        key: month,
        start: "",
        end: "",
        payday: "",
        label: month,
      }}
      basePath={basePath}
    />
  );
}
