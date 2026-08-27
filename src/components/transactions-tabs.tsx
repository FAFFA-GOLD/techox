import Link from "next/link";

export type TransactionsTab =
  | "list"
  | "categories"
  | "recurring"
  | "cards"
  | "loans";

const TABS: { id: TransactionsTab; label: string }[] = [
  { id: "list", label: "一覧" },
  { id: "categories", label: "項目" },
  { id: "recurring", label: "定期" },
  { id: "cards", label: "カード" },
  { id: "loans", label: "ローン" },
];

type Props = {
  periodKey: string;
  active: TransactionsTab;
};

export function TransactionsTabs({ periodKey, active }: Props) {
  return (
    <nav className="flex flex-wrap gap-1 rounded-xl border border-line/80 bg-surface p-1">
      {TABS.map((tab) => {
        const href = `/transactions?period=${periodKey}&tab=${tab.id}`;
        const isActive = active === tab.id;
        return (
          <Link
            key={tab.id}
            href={href}
            className={`rounded-lg px-3 py-2 text-sm transition ${
              isActive
                ? "bg-accent font-medium text-white"
                : "text-muted hover:bg-white hover:text-ink"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
