import { NextResponse } from "next/server";
import {
  dailySpendToCsv,
  encodeCsvForDownload,
  parseCsvEncoding,
} from "@/lib/csv";
import {
  buildDailySpendExportModel,
  monthBounds,
} from "@/lib/daily-spend-export";
import {
  ensureDailySpendCategories,
  fetchDailySpendEntriesInRange,
  fetchDailySpendHolidaysInRange,
} from "@/lib/data";
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

  const { start, end } = monthBounds(monthKey);
  const [categories, entries, holidays] = await Promise.all([
    ensureDailySpendCategories(),
    fetchDailySpendEntriesInRange(start, end),
    fetchDailySpendHolidaysInRange(start, end),
  ]);
  const model = buildDailySpendExportModel(
    monthKey,
    categories,
    entries,
    holidays,
  );
  const csv = dailySpendToCsv(model);
  const { body, contentType } = encodeCsvForDownload(csv, encoding);
  const filename = `daily-spend-${monthKey}.csv`;

  return new NextResponse(Buffer.from(body), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
