import { NextResponse } from "next/server";
import {
  buildDailySpendExportModel,
  monthBounds,
} from "@/lib/daily-spend-export";
import { dailySpendToPdf } from "@/lib/daily-spend-pdf";
import {
  ensureDailySpendCategories,
  fetchDailySpendEntriesInRange,
  fetchDailySpendHolidaysInRange,
} from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

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

  try {
    const pdf = await dailySpendToPdf(model);
    const filename = `daily-spend-${monthKey}.pdf`;
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "PDF generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
