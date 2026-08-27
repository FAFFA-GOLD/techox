"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { RecurringForm } from "@/components/recurring-form";
import { deleteRecurring } from "@/app/actions";
import { formatYen } from "@/lib/money";
import type { AssetAccount, Category, RecurringRule } from "@/lib/types";

type Props = {
  categories: Category[];
  accounts?: AssetAccount[];
  rules: RecurringRule[];
  editingId?: string | null;
  basePath: string;
};

export function RecurringPanel({
  categories,
  accounts = [],
  rules,
  editingId = null,
  basePath,
}: Props) {
  const router = useRouter();
  const editing = editingId
    ? (rules.find((r) => r.id === editingId) ?? null)
    : null;
  const q = basePath.includes("?") ? "&" : "?";

  return (
    <div className="grid gap-6">
      <p className="text-sm text-muted">
        家賃・給与など毎月発生する項目。日は1〜31（無い日は月末）。月末給料は「毎月月末」を選んでください。
      </p>
      <RecurringForm
        key={`${editing?.id ?? "new"}-${editing?.kind ?? "expense"}`}
        categories={categories}
        accounts={accounts}
        editing={editing}
        onCancelEdit={() => {
          router.push(basePath);
          router.refresh();
        }}
      />
      {editing ? (
        <p className="text-sm text-muted">
          編集中です。{" "}
          <Link href={basePath} className="text-accent underline">
            新規追加に戻る
          </Link>
        </p>
      ) : null}
      <section className="grid gap-3">
        <h2 className="text-lg font-bold">登録中のルール</h2>
        {rules.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line bg-white/50 px-4 py-8 text-center text-sm text-muted">
            定期ルールはまだありません
          </p>
        ) : (
          <ul className="divide-y divide-line/70 overflow-hidden rounded-xl border border-line/80 bg-surface">
            {rules.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{r.name}</p>
                  <p className="text-xs text-muted">
                    {r.day_of_month === 31
                      ? "毎月月末"
                      : `毎月${r.day_of_month}日`}{" "}
                    · {r.start_date} 〜 {r.end_date ?? "継続"}
                    {r.categories?.name ? ` · ${r.categories.name}` : ""}
                  </p>
                </div>
                <p
                  className={`shrink-0 tabular-nums text-sm ${
                    r.kind === "income" ? "text-income" : "text-expense"
                  }`}
                >
                  {r.kind === "income" ? "+" : "-"}
                  {formatYen(r.amount)}
                </p>
                <div className="flex shrink-0 gap-2">
                  <Link
                    href={`${basePath}${q}edit=${r.id}`}
                    className="text-xs text-accent hover:underline"
                  >
                    編集
                  </Link>
                  <form action={deleteRecurring}>
                    <input type="hidden" name="id" value={r.id} />
                    <button
                      type="submit"
                      className="text-xs text-muted hover:text-expense"
                    >
                      削除
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
