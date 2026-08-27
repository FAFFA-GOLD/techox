"use client";

import { formatYen } from "@/lib/money";

type Props = {
  monthSpent: number;
  entryCount: number;
};

export function ConfidentialExpensePanel({ monthSpent, entryCount }: Props) {
  return (
    <div className="rounded-lg border border-[#57534e]/35 bg-[#57534e]/8 p-3">
      <p className="text-xs uppercase tracking-wide text-muted">機密費</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-[#57534e]">
        {formatYen(monthSpent)}
      </p>
      <p className="mt-1 text-xs text-muted">
        今月 {entryCount} 件 · 予算・小遣い・月合計には含めません
      </p>
      <p className="mt-2 text-[11px] leading-relaxed text-muted">
        交通費の横で月の使用額だけ把握します。支出を追加の「機密費」ボタンから記録してください。
      </p>
    </div>
  );
}
