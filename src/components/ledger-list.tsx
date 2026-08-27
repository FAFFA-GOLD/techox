import Link from "next/link";
import { formatYen } from "@/lib/money";
import type { LedgerItem } from "@/lib/money";
import { deleteTransaction } from "@/app/actions";

export type LedgerFilter = "all" | "normal" | "recurring" | "card" | "loan";

type Props = {
  items: LedgerItem[];
  showActions?: boolean;
  /** 一覧タブのベース（例: /transactions?period=x&tab=list） */
  editBasePath?: string;
  /** カード設定タブ（例: /transactions?period=x&tab=cards） */
  cardsBasePath?: string;
  /** ローン設定タブ */
  loansBasePath?: string;
  filter?: LedgerFilter;
  /** filter=card のとき特定カードに絞る */
  sourceCardId?: string | null;
  /** filter=loan のとき特定ローンに絞る */
  sourceLoanId?: string | null;
};

function sourceLabel(item: LedgerItem): string | null {
  if (item.source === "card") return "カード";
  if (item.source === "loan") return "ローン";
  if (item.source === "recurring") return "定期";
  if (item.recurring_rule_id) return "定期確定";
  return null;
}

export function filterLedgerItems(
  items: LedgerItem[],
  filter: LedgerFilter,
  sourceCardId?: string | null,
  sourceLoanId?: string | null,
): LedgerItem[] {
  let next = items;
  if (filter === "card") {
    next = next.filter((i) => i.source === "card");
    if (sourceCardId) {
      next = next.filter((i) => i.credit_card_id === sourceCardId);
    }
    return next;
  }
  if (filter === "loan") {
    next = next.filter((i) => i.source === "loan");
    if (sourceLoanId) {
      next = next.filter((i) => i.loan_id === sourceLoanId);
    }
    return next;
  }
  if (filter === "recurring") {
    return next.filter(
      (i) => i.source === "recurring" || Boolean(i.recurring_rule_id),
    );
  }
  if (filter === "normal") {
    return next.filter(
      (i) => i.source === "transaction" && !i.recurring_rule_id,
    );
  }
  return next;
}

export function LedgerList({
  items,
  showActions = false,
  editBasePath = "/transactions",
  cardsBasePath = "/cards",
  loansBasePath = "/loans",
  filter = "all",
  sourceCardId = null,
  sourceLoanId = null,
}: Props) {
  const filtered = filterLedgerItems(
    items,
    filter,
    sourceCardId,
    sourceLoanId,
  );

  if (filtered.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line bg-white/50 px-4 py-8 text-center text-sm text-muted">
        この条件の明細はまだありません
      </p>
    );
  }

  const q = (path: string) => (path.includes("?") ? "&" : "?");

  return (
    <ul className="divide-y divide-line/70 overflow-hidden rounded-xl border border-line/80 bg-surface">
      {filtered.map((item) => {
        const tag = sourceLabel(item);
        return (
          <li key={item.id} className="flex items-center gap-3 px-4 py-3">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: item.category_color ?? "#64748b" }}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-sm font-medium">
                  {item.category_name ?? item.memo ?? "未分類"}
                </p>
                {tag ? (
                  <span className="rounded bg-ink/5 px-1.5 py-0.5 text-[10px] font-medium text-muted">
                    {tag}
                  </span>
                ) : null}
                {item.isProjected ? (
                  <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-accent">
                    予定
                  </span>
                ) : null}
              </div>
              <p className="text-xs text-muted">
                {item.date}
                {item.memo && item.category_name ? ` · ${item.memo}` : ""}
              </p>
            </div>
            <p
              className={`shrink-0 tabular-nums text-sm font-medium ${
                item.kind === "income" ? "text-income" : "text-expense"
              }`}
            >
              {item.kind === "income" ? "+" : "-"}
              {formatYen(item.amount)}
            </p>
            {showActions ? (
              <div className="flex shrink-0 gap-2">
                {item.isProjected &&
                item.source === "recurring" &&
                item.recurring_rule_id ? (
                  <Link
                    href={`${editBasePath}${q(editBasePath)}confirm=${item.recurring_rule_id}`}
                    className="text-xs text-accent hover:underline"
                  >
                    実額を確定
                  </Link>
                ) : null}
                {item.isProjected &&
                item.source === "card" &&
                item.credit_card_id ? (
                  <Link
                    href={`${cardsBasePath}${q(cardsBasePath)}confirmCard=${item.credit_card_id}&confirmDate=${item.date}`}
                    className="text-xs text-accent hover:underline"
                  >
                    実額を確定
                  </Link>
                ) : null}
                {!item.isProjected &&
                item.source === "card" &&
                item.payment_id ? (
                  <Link
                    href={`${cardsBasePath}${q(cardsBasePath)}editPayment=${item.payment_id}`}
                    className="text-xs text-accent hover:underline"
                  >
                    編集
                  </Link>
                ) : null}
                {item.isProjected && item.source === "loan" && item.loan_id ? (
                  <Link
                    href={`${loansBasePath}${q(loansBasePath)}confirmLoan=${item.loan_id}&confirmDate=${item.date}`}
                    className="text-xs text-accent hover:underline"
                  >
                    実額を確定
                  </Link>
                ) : null}
                {!item.isProjected &&
                item.source === "loan" &&
                item.payment_id ? (
                  <Link
                    href={`${loansBasePath}${q(loansBasePath)}editPayment=${item.payment_id}`}
                    className="text-xs text-accent hover:underline"
                  >
                    編集
                  </Link>
                ) : null}
                {!item.isProjected && item.source === "transaction" ? (
                  <>
                    <Link
                      href={`${editBasePath}${q(editBasePath)}edit=${item.id}`}
                      className="text-xs text-accent hover:underline"
                    >
                      編集
                    </Link>
                    <form action={deleteTransaction}>
                      <input type="hidden" name="id" value={item.id} />
                      <button
                        type="submit"
                        className="text-xs text-muted hover:text-expense"
                        aria-label="削除"
                      >
                        削除
                      </button>
                    </form>
                  </>
                ) : null}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
