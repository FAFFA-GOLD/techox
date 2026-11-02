import { CashflowClient } from "@/components/cashflow-client";
import { buildCashflowRows } from "@/lib/cashflow-forecast";
import { loadCashflowModel } from "@/lib/cashflow-model";

export default async function ForecastPage() {
  const model = await loadCashflowModel();
  const rows = buildCashflowRows(model.forecast);
  return (
    <CashflowClient
      rows={rows}
      savings={model.savings}
      base={model.forecast.base}
      savedBase={model.savedBase}
      accounts={model.accounts.map((account) => ({ id: account.id, name: account.name }))}
      incomeRules={model.incomeRules}
      allocations={model.allocations}
      periodAllocations={model.periodAllocations}
      loadError={model.loadError}
    />
  );
}
