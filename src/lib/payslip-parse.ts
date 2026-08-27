/** クライアント／サーバー共用の給与明細パース（fs なし） */

export type PayslipLine = {
  label: string;
  amount: number;
  section: "pay" | "deduction";
};

export type PayslipParseResult = {
  payday: string;
  targetYear: number;
  targetMonth: number;
  targetLabel: string;
  netPay: number;
  grossPay: number | null;
  deductionTotal: number | null;
  lines: PayslipLine[];
};

export type PayslipFileInfo = {
  filename: string;
  paydayFromName: string | null;
};

const FILENAME_RE = /^(\d{4})_(\d{2})_(\d{2})_給与明細\.pdf$/i;
const WAREKI_DATE_RE =
  /(\d{4})（[^）]+）年(\d{1,2})月(\d{1,2})日/g;
const TARGET_MONTH_RE = /(\d{4})（[^）]+）年(\d{1,2})月分/;

export const PAYSLIP_MEMO_PREFIX = "給与明細取込";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function isoDate(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

export function parseYen(raw: string): number | null {
  const n = Number(String(raw).replace(/[,，\s]/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

export function payslipMemo(targetLabel: string): string {
  return `${PAYSLIP_MEMO_PREFIX}（${targetLabel}）`;
}

/** 基本給＋固定残業、およびそこから控除を引いた額 */
export function summarizeBasePay(
  lines: PayslipLine[],
  deductionTotal: number | null,
) {
  const base = lines
    .filter((l) => l.section === "pay" && /基本給/.test(l.label))
    .reduce((s, l) => s + l.amount, 0);
  const overtime = lines
    .filter((l) => l.section === "pay" && /固定残業/.test(l.label))
    .reduce((s, l) => s + l.amount, 0);
  const basePlusOvertime = base + overtime;
  const deduction =
    deductionTotal ??
    lines
      .filter((l) => l.section === "deduction")
      .reduce((s, l) => s + l.amount, 0);
  return {
    base,
    overtime,
    basePlusOvertime,
    afterDeduction: basePlusOvertime - deduction,
    deduction,
  };
}

export function isPayslipMemo(memo: string | null | undefined): boolean {
  return Boolean(memo?.startsWith(PAYSLIP_MEMO_PREFIX));
}

export function parsePayslipFilename(filename: string): PayslipFileInfo {
  const base = filename.replace(/^.*[\\/]/, "");
  const m = base.match(FILENAME_RE);
  return {
    filename: base,
    paydayFromName: m ? `${m[1]}-${m[2]}-${m[3]}` : null,
  };
}

function firstMatchAmount(text: string, label: string): number | null {
  const re = new RegExp(
    `${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*([\\d,]+)`,
  );
  const m = text.match(re);
  return m ? parseYen(m[1]) : null;
}

function extractSectionLines(
  text: string,
  startLabel: string,
  endLabel: string,
  section: "pay" | "deduction",
): PayslipLine[] {
  const re = new RegExp(
    `${startLabel}\\t${startLabel}([\\s\\S]*?)${endLabel}`,
  );
  const mBlock = text.match(re);
  if (!mBlock) return [];
  const chunk = mBlock[1]
    .replace(/（\s*\n\s*）/g, "（）")
    .replace(/([^\n\d])\n([^\n\d])/g, "$1$2");
  const lines: PayslipLine[] = [];
  const itemRe = /([^\n\t\d][^\n\t]*?)\s+([\d,]+)/g;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(chunk))) {
    const label = m[1].replace(/\s+/g, "").trim();
    if (!label || label === startLabel || label === endLabel) continue;
    if (/^(支給|控除|勤怠|当月支払|給与関連情報)$/.test(label)) continue;
    if (label === "）" || label.length < 2) continue;
    const amount = parseYen(m[2]);
    if (amount == null) continue;
    lines.push({ label, amount, section });
  }
  return lines;
}

/** PDF本文テキストから給与明細を解析する */
export function parsePayslipText(text: string): PayslipParseResult {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\u00a0/g, " ");

  const target = normalized.match(TARGET_MONTH_RE);
  if (!target) {
    throw new Error("対象月（〇月分）を読み取れませんでした");
  }
  const targetYear = Number(target[1]);
  const targetMonth = Number(target[2]);
  const targetLabel = `${targetYear}年${pad2(targetMonth)}月分`;

  let payday: string | null = null;
  const paydayLine = normalized.match(/支給日[：:]\s*([^\n]+)/);
  if (paydayLine) {
    WAREKI_DATE_RE.lastIndex = 0;
    const dm = WAREKI_DATE_RE.exec(paydayLine[1]);
    if (dm) {
      payday = isoDate(Number(dm[1]), Number(dm[2]), Number(dm[3]));
    }
  }
  if (!payday) {
    throw new Error("支給日を読み取れませんでした");
  }

  const netPay =
    firstMatchAmount(normalized, "振込支給額") ??
    firstMatchAmount(normalized, "差引支給額");
  if (netPay == null || netPay <= 0) {
    throw new Error("振込支給額を読み取れませんでした");
  }

  const grossPay = firstMatchAmount(normalized, "支給合計");
  const deductionTotal = firstMatchAmount(normalized, "控除合計");

  const payLines = extractSectionLines(normalized, "支給", "支給合計", "pay");
  const deductionLines = extractSectionLines(
    normalized,
    "控除",
    "控除合計",
    "deduction",
  );

  return {
    payday,
    targetYear,
    targetMonth,
    targetLabel,
    netPay,
    grossPay,
    deductionTotal,
    lines: [...payLines, ...deductionLines],
  };
}
