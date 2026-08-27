import Link from "next/link";
import { CategoryForm } from "@/components/category-form";
import { deleteCategory } from "@/app/actions";
import type { Category } from "@/lib/types";

type Props = {
  categories: Category[];
  editingId?: string | null;
  basePath: string;
};

export function CategoriesPanel({
  categories,
  editingId = null,
  basePath,
}: Props) {
  const editing = editingId
    ? (categories.find((c) => c.id === editingId) ?? null)
    : null;
  const expenses = categories.filter((c) => c.kind === "expense");
  const incomes = categories.filter((c) => c.kind === "income");
  const q = basePath.includes("?") ? "&" : "?";

  return (
    <div className="grid gap-6">
      <p className="text-sm text-muted">
        出費・収入の項目を登録して、明細や定期ルールで使います。
      </p>
      <CategoryForm key={editing?.id ?? "new"} editing={editing} />
      {editing ? (
        <p className="text-sm text-muted">
          編集中です。{" "}
          <Link href={basePath} className="text-accent underline">
            新規追加に戻る
          </Link>
        </p>
      ) : null}
      <div className="grid gap-6 md:grid-cols-2">
        <CategoryGroup
          title="支出項目"
          items={expenses}
          basePath={basePath}
          q={q}
        />
        <CategoryGroup
          title="収入項目"
          items={incomes}
          basePath={basePath}
          q={q}
        />
      </div>
    </div>
  );
}

function CategoryGroup({
  title,
  items,
  basePath,
  q,
}: {
  title: string;
  items: Category[];
  basePath: string;
  q: string;
}) {
  return (
    <section className="grid gap-3">
      <h2 className="text-lg font-bold">{title}</h2>
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line bg-white/50 px-4 py-6 text-sm text-muted">
          まだありません
        </p>
      ) : (
        <ul className="divide-y divide-line/70 overflow-hidden rounded-xl border border-line/80 bg-surface">
          {items.map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-4 py-3">
              <span
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: c.color }}
              />
              <span className="flex-1 text-sm font-medium">{c.name}</span>
              <Link
                href={`${basePath}${q}edit=${c.id}`}
                className="text-xs text-accent hover:underline"
              >
                編集
              </Link>
              <form action={deleteCategory}>
                <input type="hidden" name="id" value={c.id} />
                <button
                  type="submit"
                  className="text-xs text-muted hover:text-expense"
                >
                  削除
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
