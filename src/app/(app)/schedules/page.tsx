import { ScheduledRulesPanel } from "@/components/scheduled-rules-panel";
import {
  ensureDailySpendCategories,
  fetchAssetAccounts,
  fetchScheduledRules,
  prepareDailySpendSchedules,
} from "@/lib/data";

export default async function SchedulesPage() {
  const [categories, accounts] = await Promise.all([
    ensureDailySpendCategories(),
    fetchAssetAccounts(),
  ]);
  const scheduleError = await prepareDailySpendSchedules(categories, accounts);
  const rules = await fetchScheduledRules();

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-xl font-bold">取引登録</h1>
        <p className="mt-1 text-sm text-muted">
          登録した取引の全体です。毎日の支出の一覧には、見ている月に発生するものだけ出ます。
        </p>
      </div>
      <ScheduledRulesPanel
        rules={rules}
        accounts={accounts}
        categories={categories}
        loadError={scheduleError}
      />
    </div>
  );
}
