import { NextResponse } from "next/server";
import { buildCashflowRows, type CashflowAuditLine } from "@/lib/cashflow-forecast";
import { loadCashflowModel } from "@/lib/cashflow-model";
import { buildCashflowWorkbookXml } from "@/lib/cashflow-workbook";
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
  const xml = buildCashflowWorkbookXml({
    today: model.today,
    rows,
    lines: audit.lines,
    accounts: model.accounts,
  });
  const body = Buffer.from(`\uFEFF${xml}`, "utf8");
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.ms-excel; charset=utf-8",
      "Content-Disposition": 'attachment; filename="cashflow-check.xls"',
      "Cache-Control": "no-store",
    },
  });
}
