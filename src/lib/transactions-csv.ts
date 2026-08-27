import iconv from "iconv-lite";
import { endOfMonth, format, parseISO } from "date-fns";
import { toCsv, withBom } from "@/lib/csv";
import type { Category, Transaction, TransactionKind } from "@/lib/types";

export type TransactionCsvRow = {
  date: string;
  kind: TransactionKind;
  amount: number;
  categoryName: string | null;
  memo: string | null;
};

export function calendarMonthRange(monthKey: string): {
  start: string;
  end: string;
} {
  const start = `${monthKey}-01`;
  const end = format(endOfMonth(parseISO(start)), "yyyy-MM-dd");
  return { start, end };
}

export function transactionsToCsv(
  monthKey: string,
  transactions: Transaction[],
): string {
  const header = ["対象月", "日付", "区分", "金額", "項目", "メモ"];
  const sorted = [...transactions].sort((a, b) =>
    a.date === b.date
      ? a.kind.localeCompare(b.kind) || a.amount - b.amount
      : a.date.localeCompare(b.date),
  );
  const rows = sorted.map((t) => [
    monthKey,
    t.date,
    t.kind === "income" ? "収入" : "支出",
    t.amount,
    t.categories?.name ?? "",
    t.memo ?? "",
  ]);
  return withBom(toCsv([header, ...rows]));
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      cells.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

export function parseCsvText(text: string): string[][] {
  const normalized = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n").filter((line) => line.trim().length > 0);
  return lines.map(splitCsvLine);
}

export function decodeCsvBytes(bytes: Uint8Array): string {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(bytes.subarray(3));
  }
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  if (utf8.includes("日付") || utf8.includes("区分") || utf8.includes("金額")) {
    return utf8;
  }
  const sjis = iconv.decode(Buffer.from(bytes), "Shift_JIS");
  if (sjis.includes("日付") || sjis.includes("区分") || sjis.includes("金額")) {
    return sjis;
  }
  return utf8.includes("\uFFFD") ? sjis : utf8;
}

function parseKind(raw: string): TransactionKind | null {
  const v = raw.trim();
  if (v === "収入" || v === "income" || v === "Income") return "income";
  if (v === "支出" || v === "expense" || v === "Expense") return "expense";
  return null;
}

function parseAmountCell(raw: string): number | null {
  const n = Number(String(raw).replace(/[,，\s円¥]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(Math.abs(n));
}

function headerIndex(header: string[], aliases: string[]): number {
  const normalized = header.map((h) => h.trim());
  for (const alias of aliases) {
    const i = normalized.indexOf(alias);
    if (i >= 0) return i;
  }
  return -1;
}

export function parseTransactionCsv(
  text: string,
  monthKey: string,
): { rows: TransactionCsvRow[]; error?: string } {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) {
    return { rows: [], error: "対象月の形式が不正です（yyyy-MM）" };
  }

  const table = parseCsvText(text);
  if (table.length < 1) {
    return { rows: [], error: "CSVが空です" };
  }

  const header = table[0];
  const idxDate = headerIndex(header, ["日付", "date"]);
  const idxKind = headerIndex(header, ["区分", "kind"]);
  const idxAmount = headerIndex(header, ["金額", "amount"]);
  const idxCategory = headerIndex(header, ["項目", "カテゴリ", "category"]);
  const idxMemo = headerIndex(header, ["メモ", "memo"]);
  const idxMonth = headerIndex(header, ["対象月", "月", "month"]);

  if (idxDate < 0 || idxKind < 0 || idxAmount < 0) {
    return {
      rows: [],
      error: "ヘッダーに「日付」「区分」「金額」が必要です",
    };
  }

  const { start, end } = calendarMonthRange(monthKey);
  const rows: TransactionCsvRow[] = [];
  const errors: string[] = [];

  for (let i = 1; i < table.length; i++) {
    const line = table[i];
    const lineNo = i + 1;
    if (line.every((c) => !c.trim())) continue;

    if (idxMonth >= 0) {
      const m = (line[idxMonth] ?? "").trim();
      if (m && m !== monthKey) {
        errors.push(`${lineNo}行目: 対象月が ${monthKey} と一致しません（${m}）`);
        continue;
      }
    }

    const date = (line[idxDate] ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      errors.push(`${lineNo}行目: 日付が不正です`);
      continue;
    }
    if (date < start || date > end) {
      errors.push(
        `${lineNo}行目: 日付 ${date} が対象月 ${monthKey}（${start}〜${end}）の外です`,
      );
      continue;
    }

    const kind = parseKind(line[idxKind] ?? "");
    if (!kind) {
      errors.push(`${lineNo}行目: 区分は「収入」または「支出」にしてください`);
      continue;
    }

    const amount = parseAmountCell(line[idxAmount] ?? "");
    if (amount == null) {
      errors.push(`${lineNo}行目: 金額が不正です`);
      continue;
    }

    const categoryName =
      idxCategory >= 0 ? (line[idxCategory] ?? "").trim() || null : null;
    const memo = idxMemo >= 0 ? (line[idxMemo] ?? "").trim() || null : null;

    rows.push({ date, kind, amount, categoryName, memo });
  }

  if (errors.length) {
    return {
      rows: [],
      error: errors.slice(0, 8).join(" / ") + (errors.length > 8 ? ` …他${errors.length - 8}件` : ""),
    };
  }

  return { rows };
}

export function resolveCategoryId(
  categories: Category[],
  name: string | null,
  kind: TransactionKind,
): { id: string | null; error?: string } {
  if (!name) return { id: null };
  const exact = categories.find((c) => c.name === name && c.kind === kind);
  if (exact) return { id: exact.id };
  const byName = categories.find((c) => c.name === name);
  if (byName) return { id: byName.id };
  return {
    id: null,
    error: `項目「${name}」が見つかりません。先に項目画面で作成してください`,
  };
}
