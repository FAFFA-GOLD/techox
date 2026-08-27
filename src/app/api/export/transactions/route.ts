import { NextResponse } from "next/server";
import {
  encodeCsvForDownload,
  parseCsvEncoding,
} from "@/lib/csv";
import {
  calendarMonthRange,
  transactionsToCsv,
} from "@/lib/transactions-csv";
import { fetchTransactionsInRange } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const monthKey = searchParams.get("month") ?? "";
  const encoding = parseCsvEncoding(searchParams.get("encoding"));

  if (!/^\d{4}-\d{2}$/.test(monthKey)) {
    return NextResponse.json({ error: "Invalid month" }, { status: 400 });
  }

  const { start, end } = calendarMonthRange(monthKey);
  const transactions = await fetchTransactionsInRange(start, end);
  const csv = transactionsToCsv(monthKey, transactions);
  const { body, contentType } = encodeCsvForDownload(csv, encoding);

  return new NextResponse(Buffer.from(body), {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="transactions-${monthKey}.csv"`,
    },
  });
}
