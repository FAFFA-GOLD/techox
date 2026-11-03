import { deflateRawSync as zlibDeflateRawSync } from "zlib";
import type { CashflowAuditLine, CashflowRow } from "@/lib/cashflow-forecast";

const KINDS = ["給料", "広告収入", "その他収入", "固定費", "その他支出", "調整"] as const;

export function buildCashflowWorkbook(input: {
  today: string;
  rows: CashflowRow[];
  lines: CashflowAuditLine[];
}): Buffer {
  const tracked = input.rows.filter((row) => row.tracked);
  return encodeXlsx([
    ["期間", periodRows(tracked)],
    ["明細", detailRows(input.lines)],
    ["読み方", guideRows(input.today)],
  ]);
}

/** 画面の期末と、期間シートの式が同じか */
export function cashflowWorkbookGaps(rows: CashflowRow[]): string[] {
  const gaps: string[] = [];
  for (const row of rows.filter((item) => item.tracked)) {
    const aichi =
      row.aichi.opening +
      row.aichi.salary +
      row.adIncome +
      row.aichi.otherIncome -
      row.aichi.expense +
      row.aichi.adjustment;
    const docomo =
      row.docomo.opening +
      row.docomo.salary +
      row.docomo.otherIncome -
      row.docomo.expense +
      row.docomo.adjustment;
    if (aichi !== row.aichi.ending) gaps.push(`${row.period.start} あいち ${aichi} 画面 ${row.aichi.ending}`);
    if (docomo !== row.docomo.ending) gaps.push(`${row.period.start} ドコモ ${docomo} 画面 ${row.docomo.ending}`);
  }
  return gaps;
}

function guideRows(today: string): SheetCell[][] {
  const lines = [
    "キャッシュフロー確認用",
    `出力日 ${today}。画面の表と同じ計算です。`,
    "追うのはあいち銀行とドコモ銀行だけです。貯金、R-PAY、Suica、日々の支出、交通費は入れません。",
    "最初の期首は、給料が入る前の残高です。その残高から残す給料を引きません。",
    "給料のうちあいち銀行へ残す額をあいち銀行の給料に、残りをドコモ銀行の給料に入れます。",
    "広告収入はあいち銀行です。取引登録の当月分は、登録した銀行の支出です。支出の列は正の数で、期末の式で引きます。",
    "調整は期末に足します。マイナスの調整は期末を減らします。",
    "翌月の期首は、前の期末です。あいち銀行は O、ドコモ銀行は P を次の行の期首が参照します。",
    "あいち銀行の期末は =D2+F2+H2+I2-K2+M2 です。ドコモ銀行の期末は =E2+G2+J2-L2+N2 です。",
  ];
  return lines.map((line) => [textCell(line)]);
}

function periodRows(rows: CashflowRow[]): SheetCell[][] {
  const header = [
    "期間",
    "開始",
    "終了",
    "あいち期首",
    "ドコモ期首",
    "あいち給料",
    "ドコモ給料",
    "広告収入",
    "あいちその他",
    "ドコモその他",
    "あいち支出",
    "ドコモ支出",
    "あいち調整",
    "ドコモ調整",
    "あいち期末",
    "ドコモ期末",
  ].map((label) => textCell(label, "h"));
  const body = rows.map((row, index) => {
    const excelRow = index + 2;
    const previous = index > 0 ? excelRow - 1 : 0;
    return [
      textCell(row.period.label),
      textCell(row.period.start),
      textCell(row.period.end),
      previous ? formulaNumber(`=O${previous}`, row.aichi.opening) : numberCell(row.aichi.opening),
      previous ? formulaNumber(`=P${previous}`, row.docomo.opening) : numberCell(row.docomo.opening),
      numberCell(row.aichi.salary),
      numberCell(row.docomo.salary),
      numberCell(row.adIncome),
      numberCell(row.aichi.otherIncome),
      numberCell(row.docomo.otherIncome),
      numberCell(row.aichi.expense),
      numberCell(row.docomo.expense),
      numberCell(row.aichi.adjustment),
      numberCell(row.docomo.adjustment),
      formulaNumber(
        `=D${excelRow}+F${excelRow}+H${excelRow}+I${excelRow}-K${excelRow}+M${excelRow}`,
        row.aichi.ending,
      ),
      formulaNumber(
        `=E${excelRow}+G${excelRow}+J${excelRow}-L${excelRow}+N${excelRow}`,
        row.docomo.ending,
      ),
    ];
  });
  return [header, ...body];
}

function detailRows(lines: CashflowAuditLine[]): SheetCell[][] {
  const header = ["期間開始", "期間終了", "日付", "銀行", "種類", "項目", "金額"].map((label) =>
    textCell(label, "h"),
  );
  const rank = new Map(KINDS.map((kind, index) => [kind, index]));
  const sorted = [...lines].sort(
    (a, b) =>
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
