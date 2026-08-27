import { formatYen } from "@/lib/money";

export type StatLine = {
  label: string;
  amount: number;
  projected?: boolean;
};

type Props = {
  label: string;
  value: number;
  hint?: string;
  tone?: "default" | "income" | "expense" | "balance";
  /** 内訳の計算行（実額確定後は確定額がここに出る） */
  lines?: StatLine[];
  /** 内訳の合計式を下に出す（例: A + B = 合計） */
  formula?: string;
};

export function StatBlock({
  label,
  value,
  hint,
  tone = "default",
  lines,
  formula,
}: Props) {
  const toneClass =
    tone === "income"
      ? "text-income"
      : tone === "expense"
        ? "text-expense"
        : tone === "balance"
          ? value >= 0
            ? "text-income"
            : "text-expense"
          : "text-ink";

  return (
    <div className="rounded-xl border border-line/80 bg-surface p-4 shadow-[0_10px_30px_-20px_rgba(15,40,35,0.45)]">
      <p className="text-xs uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className={`mt-2 text-2xl font-bold tabular-nums ${toneClass}`}>
        {formatYen(value)}
      </p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
      {lines && lines.length > 0 ? (
        <ul className="mt-3 space-y-1 border-t border-line/60 pt-2">
          {lines.map((line, i) => (
            <li
              key={`${line.label}-${i}`}
              className="flex items-start justify-between gap-2 text-xs"
            >
              <span className="min-w-0 text-muted">
                {line.label}
                {line.projected ? (
                  <span className="ml-1 text-[10px] text-accent">予定</span>
                ) : null}
              </span>
              <span
                className={`shrink-0 tabular-nums ${
                  line.amount >= 0 && tone === "income"
                    ? "text-income"
                    : tone === "expense" || line.amount < 0
                      ? "text-expense"
                      : "text-ink"
                }`}
              >
                {tone === "expense" || (tone === "balance" && line.amount < 0)
                  ? line.amount > 0 && tone === "expense"
                    ? `−${formatYen(line.amount)}`
                    : formatYen(line.amount)
                  : formatYen(line.amount)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {formula ? (
        <p className="mt-2 text-[11px] leading-relaxed text-muted">{formula}</p>
      ) : null}
    </div>
  );
}
