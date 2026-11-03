import { CashflowClient } from "@/components/cashflow-client";
import { buildCashflowRows } from "@/lib/cashflow-forecast";
import { loadCashflowModel } from "@/lib/cashflow-model";

export default async function ForecastPage() {
  const model = await loadCashflowModel();
  const rows = buildCashflowRows(model.forecast);
  return (
    <CashflowClient
      rows={rows}
      openingPeriodStart={model.banks.openingPeriodStart}
      aichiOpening={model.banks.aichiOpening}
      docomoOpening={model.banks.docomoOpening}
      salaryRetain={model.banks.salaryRetain}
      savedBase={model.savedBase}
      loadError={model.loadError}
    />
  );
}
