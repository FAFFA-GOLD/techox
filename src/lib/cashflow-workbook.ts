import { deflateRawSync as zlibDeflateRawSync } from "zlib";
import type { CashflowAuditLine, CashflowRow } from "@/lib/cashflow-forecast";

const KINDS = [
  "給料",
  "広告収入",
  "その他収入",
  "固定費",
  "その他支出",
  "デイリー",
  "交通費",
  "調整",
] as const;

type Kind = (typeof KINDS)[number];

export type CashflowWorkbookAccount = {
  name: string;
  balance: number;
  savings: boolean;
};

export function buildCashflowWorkbook(input: {
  today: string;
  rows: CashflowRow[];
  lines: CashflowAuditLine[];
  accounts: CashflowWorkbookAccount[];
}): Buffer {
  const projected = input.rows.filter((row) => row.phase !== "past");
  const departments = departmentList(input.accounts, input.lines);
  const built = buildDepartmentRows(projected, input.lines, departments, input.accounts);
  return encodeXlsx([
    ["期間", periodRows(projected, built.rows)],
    ["部門", departmentSheetRows(built.rows, departments.length)],
    ["明細", detailRows(input.lines)],
    ["残高", balanceRows(input.accounts)],
    ["読み方", guideRows(input.today)],
  ]);
}

/** 部門の期末を足すと、画面の期末と一致するか */
export function cashflowWorkbookGaps(input: {
  rows: CashflowRow[];
  lines: CashflowAuditLine[];
  accounts: CashflowWorkbookAccount[];
}): string[] {
  const projected = input.rows.filter((row) => row.phase !== "past");
  const departments = departmentList(input.accounts, input.lines);
  const built = buildDepartmentRows(projected, input.lines, departments, input.accounts);
  const gaps: string[] = [];
  for (const row of projected) {
    const ending = built.rows
      .filter((line) => line.periodStart === row.period.start)
      .reduce((sum, line) => sum + line.ending, 0);
    if (ending !== row.ending) {
      gaps.push(`${row.period.start} 計算 ${ending} 画面 ${row.ending}`);
    }
    for (const line of built.rows.filter((item) => item.periodStart === row.period.start)) {
      if (line.screen != null && line.screen !== line.ending) {
        gaps.push(`${row.period.start} ${line.name} 内訳 ${line.screen} 計算 ${line.ending}`);
      }
    }
  }
  return gaps;
}

function departmentList(
  accounts: CashflowWorkbookAccount[],
  lines: CashflowAuditLine[],
): { name: string; savings: boolean }[] {
  const departments: { name: string; savings: boolean }[] = [];
  const seen = new Set<string>();
  for (const account of accounts) {
    if (seen.has(account.name)) continue;
    seen.add(account.name);
    departments.push({
      name: account.name,
      savings: accounts.some((item) => item.name === account.name && item.savings),
    });
  }
  for (const line of lines) {
    if (seen.has(line.accountName)) continue;
    seen.add(line.accountName);
    departments.push({ name: line.accountName, savings: false });
  }
  if (!seen.has("未割り振り")) departments.push({ name: "未割り振り", savings: false });
  return departments;
}

type DepartmentSheetRow = {
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  name: string;
  opening: number;
  amounts: Record<Kind, number>;
  ending: number;
  screen: number | null;
  savings: boolean;
};

function buildDepartmentRows(
  projected: CashflowRow[],
  lines: CashflowAuditLine[],
  departments: { name: string; savings: boolean }[],
  accounts: CashflowWorkbookAccount[],
): { rows: DepartmentSheetRow[] } {
  const running = new Map<string, number>();
  for (const department of departments) running.set(department.name, 0);
  for (const account of accounts) {
    running.set(account.name, (running.get(account.name) ?? 0) + account.balance);
  }
  running.set("未割り振り", 0);
  const savingsByName = new Map(departments.map((department) => [department.name, department.savings]));
  const rows: DepartmentSheetRow[] = [];
  for (const row of projected) {
    const sums = new Map<string, Record<Kind, number>>();
    for (const line of lines) {
      if (line.periodStart !== row.period.start) continue;
      const bucket = sums.get(line.accountName) ?? emptyKinds();
      bucket[line.kind] += line.amount;
      sums.set(line.accountName, bucket);
    }
    for (const department of departments) {
      const opening = running.get(department.name) ?? 0;
      const amounts = sums.get(department.name) ?? emptyKinds();
      const ending = opening + KINDS.reduce((sum, kind) => sum + amounts[kind], 0);
      running.set(department.name, ending);
      rows.push({
        periodStart: row.period.start,
        periodEnd: row.period.end,
        periodLabel: row.period.label,
        name: department.name,
        opening,
        amounts,
        ending,
        screen: screenEnding(row, department.name),
        savings: savingsByName.get(department.name) ?? false,
      });
    }
  }
  return { rows };
}

function emptyKinds(): Record<Kind, number> {
  return {
    給料: 0,
    広告収入: 0,
    その他収入: 0,
    固定費: 0,
    その他支出: 0,
    デイリー: 0,
    交通費: 0,
    調整: 0,
  };
}

function screenEnding(row: CashflowRow, name: string): number | null {
  const breakdown = row.breakdown;
  if (!breakdown) return null;
  if (name === "未割り振り") {
    if (breakdown.budgetsApplied) return breakdown.unassigned;
    return breakdown.unassigned - breakdown.daily - breakdown.transport - breakdown.adjustment;
  }
  const matches = breakdown.accounts.filter((line) => line.name === name);
  if (matches.length === 0) return null;
  return matches.reduce((sum, line) => sum + line.ending, 0);
}

function guideRows(today: string): SheetCell[][] {
  const lines = [
    "キャッシュフロー確認用",
    `出力日 ${today}。画面の表と同じ計算です。`,
    "支出はマイナスです。期末の数式は =D2+E2+F2+G2+H2+I2+J2+K2+L2 です。セル番地に引用符は付きません。",
    "いまの期間の期首は、今日の部門残高です。今日までの入出金は残高に入っているので、給料・広告・固定費は明日以降だけ足します。",
    "先の期間は、前の期末を期首にして、その期間の収入と固定費を全部入れます。",
    "デイリーと交通費は、いまの期間は設定額から記録済みを引いた残りです。先の期間は設定額を全部引きます。",
    "給料と広告は、割り振り先の部門に載せます。割り振っていない分は未割り振りです。",
    "固定費は取引登録の支出です。家へ出す分も、引き落とす部門の固定費として明細に出ます。",
    "画面の期末はアプリの表の数字です。差が0でない行は、表とこの内訳が食い違っています。",
    "残高シートは今日の部門残高です。貯金も残高に含まれます。",
  ];
  return lines.map((line) => [textCell(line)]);
}

function periodRows(projected: CashflowRow[], departments: DepartmentSheetRow[]): SheetCell[][] {
  const header = [
    "期間",
    "開始",
    "終了",
    "期首",
    "給料",
    "広告収入",
    "その他収入",
    "固定費",
    "その他支出",
    "デイリー",
    "交通費",
    "調整",
    "期末",
    "画面の期末",
    "差",
  ].map((label) => textCell(label, "h"));
  const body = projected.map((row, index) => {
    const excelRow = index + 2;
    const cached = departments.filter((line) => line.periodStart === row.period.start);
    const sum = (pick: (line: DepartmentSheetRow) => number) =>
      cached.reduce((total, line) => total + pick(line), 0);
    const opening = sum((line) => line.opening);
    const kindSum = (kind: Kind) => sum((line) => line.amounts[kind]);
    const ending = sum((line) => line.ending);
    return [
      textCell(row.period.label),
      textCell(row.period.start),
      textCell(row.period.end),
      numberCell(opening),
      ...KINDS.map((kind) => numberCell(kindSum(kind))),
      formulaNumber(`=D${excelRow}+E${excelRow}+F${excelRow}+G${excelRow}+H${excelRow}+I${excelRow}+J${excelRow}+K${excelRow}+L${excelRow}`, ending),
      numberCell(row.ending),
      formulaNumber(`=M${excelRow}-N${excelRow}`, ending - row.ending),
    ];
  });
  return [header, ...body];
}

function departmentSheetRows(rows: DepartmentSheetRow[], departmentCount: number): SheetCell[][] {
  const header = [
    "期間開始",
    "期間終了",
    "部門",
    "期首",
    "給料",
    "広告収入",
    "その他収入",
    "固定費",
    "その他支出",
    "デイリー",
    "交通費",
    "調整",
    "期末",
    "画面の期末",
    "差",
    "貯金",
  ].map((label) => textCell(label, "h"));
  const body = rows.map((row, index) => {
    const excelRow = index + 2;
    const previous = index >= departmentCount ? excelRow - departmentCount : 0;
    const kindCells = KINDS.map((kind) => numberCell(row.amounts[kind]));
    return [
      textCell(row.periodStart),
      textCell(row.periodEnd),
      textCell(row.name),
      previous
        ? formulaNumber(`=M${previous}`, row.opening)
        : numberCell(row.opening),
      ...kindCells,
      formulaNumber(
        `=D${excelRow}+E${excelRow}+F${excelRow}+G${excelRow}+H${excelRow}+I${excelRow}+J${excelRow}+K${excelRow}+L${excelRow}`,
        row.ending,
      ),
      row.screen == null ? textCell("") : numberCell(row.screen),
      row.screen == null ? textCell("") : formulaNumber(`=M${excelRow}-N${excelRow}`, row.ending - row.screen),
      textCell(row.savings ? "貯金" : ""),
    ];
  });
  return [header, ...body];
}

function detailRows(lines: CashflowAuditLine[]): SheetCell[][] {
  const header = ["期間開始", "期間終了", "日付", "部門", "種類", "項目", "金額"].map((label) =>
    textCell(label, "h"),
  );
  const rank = new Map(KINDS.map((kind, index) => [kind, index]));
  const sorted = [...lines].sort((a, b) =>
    a.periodStart.localeCompare(b.periodStart) ||
    a.date.localeCompare(b.date) ||
    (rank.get(a.kind) ?? 0) - (rank.get(b.kind) ?? 0) ||
    a.accountName.localeCompare(b.accountName, "ja") ||
    a.item.localeCompare(b.item, "ja"),
  );
  const body = sorted.map((line) => [
    textCell(line.periodStart),
    textCell(line.periodEnd),
    textCell(line.date),
    textCell(line.accountName),
    textCell(line.kind),
    textCell(line.item),
    numberCell(line.amount),
  ]);
  return [header, ...body];
}

function balanceRows(accounts: CashflowWorkbookAccount[]): SheetCell[][] {
  const header = ["部門", "今日の残高", "貯金"].map((label) => textCell(label, "h"));
  const seen = new Set<string>();
  const body: SheetCell[][] = [];
  let cachedTotal = 0;
  for (const account of accounts) {
    if (seen.has(account.name)) continue;
    seen.add(account.name);
    const balance = accounts
      .filter((item) => item.name === account.name)
      .reduce((sum, item) => sum + item.balance, 0);
    cachedTotal += balance;
    const savings = accounts.some((item) => item.name === account.name && item.savings);
    body.push([
      textCell(account.name),
      numberCell(balance),
      textCell(savings ? "貯金" : ""),
    ]);
  }
  const lastDataRow = body.length + 1;
  body.push([
    textCell("合計", "h"),
    lastDataRow >= 2
      ? formulaNumber(`=SUM(B2:B${lastDataRow})`, cachedTotal)
      : numberCell(0),
    textCell(""),
  ]);
  return [header, ...body];
}

type SheetCell =
  | { t: "s"; v: string; bold?: boolean }
  | { t: "n"; v: number }
  | { t: "f"; f: string; v: number };

function textCell(value: string, style?: "h"): SheetCell {
  return { t: "s", v: value, bold: style === "h" };
}

function numberCell(value: number): SheetCell {
  return { t: "n", v: value };
}

function formulaNumber(formula: string, value: number): SheetCell {
  return { t: "f", f: formula.replace(/^=/, ""), v: value };
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return String(value);
}

function xmlText(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function encodeXlsx(sheets: [string, SheetCell[][]][]): Buffer {
  const files: { name: string; data: Buffer }[] = [
    { name: "[Content_Types].xml", data: Buffer.from(contentTypes(sheets.length), "utf8") },
    { name: "_rels/.rels", data: Buffer.from(rootRels(), "utf8") },
    { name: "xl/workbook.xml", data: Buffer.from(workbookXml(sheets.map(([name]) => name)), "utf8") },
    { name: "xl/_rels/workbook.xml.rels", data: Buffer.from(workbookRels(sheets.length), "utf8") },
    { name: "xl/styles.xml", data: Buffer.from(stylesXml(), "utf8") },
  ];
  sheets.forEach(([, rows], index) => {
    files.push({
      name: `xl/worksheets/sheet${index + 1}.xml`,
      data: Buffer.from(sheetXml(rows), "utf8"),
    });
  });
  return zipFiles(files);
}

function contentTypes(count: number): string {
  const sheets = Array.from({ length: count }, (_, index) =>
    `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
  ).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${sheets}
</Types>`;
}

function rootRels(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
}

function workbookXml(names: string[]): string {
  const sheets = names
    .map((name, index) => `<sheet name="${xmlText(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`)
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${sheets}</sheets>
</workbook>`;
}

function workbookRels(count: number): string {
  const sheets = Array.from({ length: count }, (_, index) =>
    `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
  ).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheets}
<Relationship Id="rId${count + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
}

function stylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="1"><fill><patternFill patternType="none"/></fill></fills>
<borders count="1"><border/></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="3">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" applyFont="1"/>
</cellXfs>
</styleSheet>`;
}

function sheetXml(rows: SheetCell[][]): string {
  const body = rows
    .map((row, rowIndex) => {
      const excelRow = rowIndex + 1;
      const cells = row
        .map((cell, columnIndex) => cellXml(cell, `${columnName(columnIndex + 1)}${excelRow}`))
        .join("");
      return `<row r="${excelRow}">${cells}</row>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetData>${body}</sheetData>
</worksheet>`;
}

function cellXml(cell: SheetCell, ref: string): string {
  if (cell.t === "s") {
    const style = cell.bold ? ` s="2"` : "";
    return `<c r="${ref}" t="inlineStr"${style}><is><t>${xmlText(cell.v)}</t></is></c>`;
  }
  if (cell.t === "f") {
    return `<c r="${ref}" s="1"><f>${xmlText(cell.f)}</f><v>${formatNumber(cell.v)}</v></c>`;
  }
  return `<c r="${ref}" s="1"><v>${formatNumber(cell.v)}</v></c>`;
}

function columnName(index: number): string {
  let name = "";
  let n = index;
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

function zipFiles(files: { name: string; data: Buffer }[]): Buffer {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const compressed = deflateRaw(file.data);
    const crc = crc32(file.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const localFile = Buffer.concat([local, name, compressed]);
    locals.push(localFile);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(8, 10);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(compressed.length, 20);
    cen.writeUInt32LE(file.data.length, 24);
    cen.writeUInt16LE(name.length, 28);
    cen.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([cen, name]));
    offset += localFile.length;
  }
  const centralDir = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralDir, end]);
}

function deflateRaw(data: Buffer): Buffer {
  return zlibDeflateRawSync(data);
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
