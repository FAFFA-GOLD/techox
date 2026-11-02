import { NextResponse } from "next/server";
// 通常の xlsx。数式は D2+E2 の形で、'D2' にはしない。
import { buildCashflowRows, type CashflowAuditLine } from "@/lib/cashflow-forecast";
import { loadCashflowModel } from "@/lib/cashflow-model";
import { buildCashflowWorkbook } from "@/lib/cashflow-workbook";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const model = await loadCashflowModel();
  const audit: { lines: CashflowAuditLine[] } = { lines: [] };
  const rows = buildCashflowRows({ ...model.forecast, audit });
  const body = buildCashflowWorkbook({
    today: model.today,
    rows,
    lines: audit.lines,
    accounts: model.accounts,
  });
  return new NextResponse(new Uint8Array(body), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="cashflow-check.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
