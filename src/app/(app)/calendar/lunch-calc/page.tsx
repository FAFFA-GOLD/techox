import Link from "next/link";
import { LunchCalcClient } from "@/components/lunch-calc-client";
import { fetchLunchMenuItems } from "@/lib/data";

type Props = {
  searchParams: Promise<{ month?: string }>;
};

export default async function LunchCalcPage({ searchParams }: Props) {
  const params = await searchParams;
  const month = params.month;
  const backHref = month ? `/calendar?month=${month}` : "/calendar";
  const items = await fetchLunchMenuItems();

  return (
    <div className="grid gap-6">
      <div>
        <p className="text-sm text-muted">
          <Link href={backHref} className="hover:text-ink">
            ← 毎日の支出
          </Link>
        </p>
        <h1 className="text-xl font-bold">昼食計算</h1>
        <p className="mt-1 text-sm text-muted">
          店ごとの昼食候補を集めて、最安比較や価格帯の把握、月間ランダム予想に使います。
        </p>
      </div>
      <LunchCalcClient initialItems={items} />
    </div>
  );
}
