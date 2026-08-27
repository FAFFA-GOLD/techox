import { NextResponse } from "next/server";
import {
  encodeCsvForDownload,
  parseCsvEncoding,
  periodLedgerToCsv,
} from "@/lib/csv";
import {
  buildPeriodLedger,
  currentPeriodKey,
  getPeriodRange,
} from "@/lib/money";
import {
  fetchCardPayments,
  fetchCreditCards,
  fetchLoanPayments,
  fetchLoans,
  fetchRecurringRules,
  fetchSettings,
  fetchTransactionsInRange,
} from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import type { PeriodKey } from "@/lib/types";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const settings = await fetchSettings();
  const raw = searchParams.get("period") ?? searchParams.get("month");
  const periodKey = (raw ?? currentPeriodKey(settings)) as PeriodKey;
  const encoding = parseCsvEncoding(searchParams.get("encoding"));

  if (!/^\d{4}-\d{2}$/.test(periodKey)) {
    return NextResponse.json({ error: "Invalid period" }, { status: 400 });
  }

  const period = getPeriodRange(periodKey, settings);
  const [transactions, rules, cardPayments, loans, cards, loanPayments] =
    await Promise.all([
      fetchTransactionsInRange(period.start, period.end),
      fetchRecurringRules(),
      fetchCardPayments(),
      fetchLoans(),
      fetchCreditCards(),
      fetchLoanPayments(),
    ]);

  const ledger = buildPeriodLedger(
    period,
    transactions,
    rules,
    cardPayments,
    loans,
    cards,
    loanPayments,
  );
  const csv = periodLedgerToCsv(period, ledger);
  const { body, contentType } = encodeCsvForDownload(csv, encoding);
  const filename = `ledger-${period.key}.csv`;

  return new NextResponse(Buffer.from(body), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
