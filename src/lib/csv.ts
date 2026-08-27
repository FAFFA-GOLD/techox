import iconv from "iconv-lite";
import type { LedgerItem } from "@/lib/money";
import type { PeriodRange } from "@/lib/types";
import type { DailySpendExportModel } from "@/lib/daily-spend-export";

function escapeCsvCell(value: string | number | null | undefined): string {
  if (value == null) return "";
  const s = String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n");
}

/** Excel 向け UTF-8 BOM 付き（文字列） */
export function withBom(csv: string): string {
  return `\uFEFF${csv}`;
}

export type CsvEncoding = "sjis" | "utf8";

/**
 * 日本語 Excel でダブルクリックしても化けにくいよう、既定は Shift_JIS。
 * Google スプレッドシート等向けは encoding=utf8。
 */
export function encodeCsvForDownload(
  csv: string,
  encoding: CsvEncoding = "sjis",
): { body: Uint8Array; contentType: string } {
  const plain = csv.replace(/^\uFEFF/, "");
  if (encoding === "utf8") {
    const bom = new Uint8Array([0xef, 0xbb, 0xbf]);
    const text = new TextEncoder().encode(plain);
    const body = new Uint8Array(bom.length + text.length);
    body.set(bom, 0);
    body.set(text, bom.length);
    return { body, contentType: "text/csv; charset=utf-8" };
  }
  return {
    body: new Uint8Array(iconv.encode(plain, "Shift_JIS")),
    contentType: "text/csv; charset=shift_jis",
  };
}

export function parseCsvEncoding(raw: string | null): CsvEncoding {
  if (raw === "utf8" || raw === "utf-8") return "utf8";
  return "sjis";
}

const SOURCE_LABEL: Record<string, string> = {
  transaction: "明細",
  recurring: "定期",
  card: "カード",
  loan: "ローン",
};

export function periodLedgerToCsv(
  period: PeriodRange,
  ledger: LedgerItem[],
): string {
  const header = [
    "給与期",
    "期間開始",
    "期間終了",
    "給料日",
    "日付",
    "区分",
    "金額",
    "符号付き金額",
    "項目",
    "メモ",
    "種別",
    "状態",
    "一回払い",
    "分割",
    "元金",
    "利息",
  ];

  const sorted = [...ledger].sort((a, b) =>
    a.date === b.date
      ? a.kind.localeCompare(b.kind)
      : a.date.localeCompare(b.date),
  );

  const rows = sorted.map((item) => {
    const signed = item.kind === "income" ? item.amount : -item.amount;
    return [
      period.key,
      period.start,
      period.end,
      period.payday,
      item.date,
      item.kind === "income" ? "収入" : "支出",
      item.amount,
      signed,
      item.category_name ?? "",
      item.memo ?? "",
      SOURCE_LABEL[item.source ?? "transaction"] ?? item.source ?? "",
      item.isProjected ? "予定" : "確定",
      item.one_time_amount ?? "",
      item.installment_amount ?? "",
      item.principal_amount ?? "",
      item.interest_amount ?? "",
    ];
  });

  return withBom(toCsv([header, ...rows]));
}

/** 日々支出の月次 CSV（集計＋明細） */
export function dailySpendToCsv(model: DailySpendExportModel): string {
  const rows: (string | number | null | undefined)[][] = [
    [
      "区分",
      "対象月",
      "期間開始",
      "期間終了",
      "用途",
      "予算",
      "支出",
      "残額",
      "日付",
      "金額",
      "メモ",
      "件数",
    ],
  ];

  for (const c of model.categories) {
    rows.push([
      "集計",
      model.monthKey,
      model.start,
      model.end,
      c.name,
      c.shared ? "" : c.budget,
      c.spent,
      c.shared ? "" : c.remaining,
      "",
      "",
      c.shared ? "小遣い合計枠から減算" : "",
      "",
    ]);
  }

  rows.push([
    "集計",
    model.monthKey,
    model.start,
    model.end,
    "小遣い合計（家族+昼食+雑費+酒+お菓子+その他）",
    model.pocketBudgetTotal,
    model.pocketSpentTotal,
    model.pocketRemaining,
    "",
    "",
    "",
    "",
  ]);

  rows.push([
    "集計",
    model.monthKey,
    model.start,
    model.end,
    "月間支出総額（交通費除く）",
    "",
    model.monthTotal,
    "",
    "",
    "",
    "",
    model.entryCount,
  ]);

  rows.push([
    "集計",
    model.monthKey,
    model.start,
    model.end,
    "交通費",
    "",
    model.transportTotal,
    "",
    "",
    "",
    "月合計には含めない",
    "",
  ]);

  const lunch = model.categories.find((c) => c.name === "昼食");
  rows.push([
    "集計",
    model.monthKey,
    model.start,
    model.end,
    "昼食・一日上限",
    model.weekdayCount,
    lunch?.lunchDaily ?? "",
    lunch?.remaining ?? "",
    "",
    "",
    `残り平日${model.weekdayCount}日（会社休日${model.holidays.length}日除外）・残÷残平日切捨て`,
    "",
  ]);

  rows.push([]);

  for (const e of model.entries) {
    rows.push([
      "明細",
      model.monthKey,
      model.start,
      model.end,
      e.category,
      "",
      "",
      "",
      e.date,
      e.amount,
      e.memo,
      "",
    ]);
  }

  for (const d of model.dailyTotals) {
    rows.push([
      "日計",
      model.monthKey,
      model.start,
      model.end,
      "",
      "",
      "",
      "",
      d.date,
      d.total,
      "当日合計",
      d.count,
    ]);
  }

  return withBom(toCsv(rows));
}
