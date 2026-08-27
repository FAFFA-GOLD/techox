import { formatYen } from "@/lib/money";
import { summarizeBasePay } from "@/lib/payslip-parse";
import type { PayslipImport } from "@/lib/types";

type Props = {
  imports: PayslipImport[];
};

export function PayslipDetailPanel({ imports }: Props) {
  if (imports.length === 0) {
    return (
      <section className="grid gap-2 rounded-xl border border-dashed border-line bg-white/50 p-4">
        <h2 className="text-lg font-bold">給与明細（取込済み）</h2>
        <p className="text-sm text-muted">
          この期間に取り込んだ給与明細はまだありません。下の「給与明細取込」から登録すると、ここに支給・控除の内訳が表示されます。
        </p>
      </section>
    );
  }

  return (
    <section className="grid gap-3">
      <h2 className="text-lg font-bold">給与明細（取込済み）</h2>
      {imports.map((slip) => {
        const payLines = slip.details.filter((d) => d.section === "pay");
        const dedLines = slip.details.filter((d) => d.section === "deduction");
        const baseSummary = summarizeBasePay(slip.details, slip.deduction_total);
        return (
          <article
            key={slip.id}
            className="grid gap-3 rounded-xl border border-line/80 bg-white/60 p-4"
          >
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">{slip.target_label}</p>
                <p className="text-xs text-muted">
                  支給日 {slip.payday}
                  {slip.filename ? ` · ${slip.filename}` : ""}
                </p>
              </div>
              <p className="text-xl font-bold tabular-nums text-income">
                {formatYen(slip.net_pay)}
              </p>
            </div>

            <dl className="grid gap-1 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-muted">振込支給額</dt>
                <dd className="tabular-nums font-medium text-income">
                  {formatYen(slip.net_pay)}
                </dd>
              </div>
              {slip.gross_pay != null ? (
                <div>
                  <dt className="text-xs text-muted">支給合計</dt>
                  <dd className="tabular-nums">{formatYen(slip.gross_pay)}</dd>
                </div>
              ) : null}
              {slip.deduction_total != null ? (
                <div>
                  <dt className="text-xs text-muted">控除合計</dt>
                  <dd className="tabular-nums">{formatYen(slip.deduction_total)}</dd>
                </div>
              ) : null}
            </dl>

            {baseSummary.basePlusOvertime > 0 ? (
              <dl className="grid gap-2 rounded-lg border border-line/60 bg-white/80 p-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted">基本給＋固定残業</dt>
                  <dd className="text-base font-semibold tabular-nums">
                    {formatYen(baseSummary.basePlusOvertime)}
                  </dd>
                  <p className="mt-0.5 text-[11px] text-muted">
                    基本給 {formatYen(baseSummary.base)}
                    {baseSummary.overtime > 0
                      ? ` ＋ 固定残業 ${formatYen(baseSummary.overtime)}`
                      : ""}
                  </p>
                </div>
                <div>
                  <dt className="text-xs text-muted">基本給＋固定残業 − 控除</dt>
                  <dd className="text-base font-semibold tabular-nums text-income">
                    {formatYen(baseSummary.afterDeduction)}
                  </dd>
                  <p className="mt-0.5 text-[11px] text-muted">
                    {formatYen(baseSummary.basePlusOvertime)} − 控除{" "}
                    {formatYen(baseSummary.deduction)}
                    （通勤手当などは含みません）
                  </p>
                </div>
              </dl>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-medium text-muted">支給内訳</p>
                {payLines.length === 0 ? (
                  <p className="text-sm text-muted">—</p>
                ) : (
                  <ul className="grid gap-1 text-sm">
                    {payLines.map((line) => (
                      <li
                        key={`p-${line.label}`}
                        className="flex justify-between gap-2"
                      >
                        <span>{line.label}</span>
                        <span className="tabular-nums text-muted">
                          {formatYen(line.amount)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-muted">控除内訳</p>
                {dedLines.length === 0 ? (
                  <p className="text-sm text-muted">—</p>
                ) : (
                  <ul className="grid gap-1 text-sm">
                    {dedLines.map((line) => (
                      <li
                        key={`d-${line.label}`}
                        className="flex justify-between gap-2"
                      >
                        <span>{line.label}</span>
                        <span className="tabular-nums text-muted">
                          {formatYen(line.amount)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </article>
        );
      })}
    </section>
  );
}
