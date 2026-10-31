import { ScheduledRulesPanel } from "@/components/scheduled-rules-panel";
import {
  ensureDailySpendCategories,
  fetchAssetAccounts,
  fetchScheduledRules,
  fetchScheduledSpendEntries,
  prepareDailySpendSchedules,
} from "@/lib/data";

export default async function SchedulesPage() {
  const [categories, accounts] = await Promise.all([
    ensureDailySpendCategories(),
    fetchAssetAccounts(),
  ]);
  const scheduleError = await prepareDailySpendSchedules(categories, accounts);
  const [rules, occurrences] = await Promise.all([
    fetchScheduledRules(),
    fetchScheduledSpendEntries(),
  ]);

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-xl font-bold">取引登録</h1>
        <p className="mt-1 text-sm text-muted">
          発生した日ごとに並びます。すべてと、種別（定期・カード・ローン）で絞り込めます。同じ日が2行あるときは、余分な分を削除するとその日の二重計上が止まります。
        </p>
      </div>
      <ScheduledRulesPanel
        rules={rules}
        accounts={accounts}
        categories={categories}
        loadError={scheduleError}
        occurrences={occurrences}
      />
    </div>
  );
}
