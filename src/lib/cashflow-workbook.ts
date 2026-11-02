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

export function buildCashflowWorkbookXml(input: {
  today: string;
  rows: CashflowRow[];
  lines: CashflowAuditLine[];
  accounts: CashflowWorkbookAccount[];
}): string {
  const projected = input.rows.filter((row) => row.phase !== "past");
  const departments = departmentList(input.accounts, input.lines);
  const built = buildDepartmentRows(projected, input.lines, departments, input.accounts);
  const sheets = [
    worksheet("期間", periodRows(projected, built.rows)),
    worksheet("部門", departmentSheetRows(built.rows, departments.length)),
    worksheet("明細", detailRows(input.lines)),
    worksheet("残高", balanceRows(input.accounts)),
    worksheet("読み方", guideRows(input.today)),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Styles>
<Style ss:ID="h"><Font ss:Bold="1"/></Style>
<Style ss:ID="n"><NumberFormat ss:Format="#,##0"/></Style>
</Styles>
${sheets.join("\n")}
</Workbook>
`;
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

function guideRows(today: string): string[][] {
  const lines = [
    "キャッシュフロー確認用",
    `出力日 ${today}。画面の表と同じ計算です。`,
    "支出はマイナスです。給料・固定費などの金額はそのまま入っています。期末と差は、同じ行の足し算です。",
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

function periodRows(projected: CashflowRow[], departments: DepartmentSheetRow[]): string[][] {
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

function departmentSheetRows(rows: DepartmentSheetRow[], departmentCount: number): string[][] {
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

function detailRows(lines: CashflowAuditLine[]): string[][] {
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

function balanceRows(accounts: CashflowWorkbookAccount[]): string[][] {
  const header = ["部門", "今日の残高", "貯金"].map((label) => textCell(label, "h"));
  const seen = new Set<string>();
  const body: string[][] = [];
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
      ? formulaNumber(`=${Array.from({ length: lastDataRow - 1 }, (_, index) => `B${index + 2}`).join("+")}`, cachedTotal)
      : numberCell(0),
    textCell(""),
  ]);
  return [header, ...body];
}

function worksheet(name: string, rows: string[][]): string {
  const xmlRows = rows
    .map((row) => `<Row>${row.join("")}</Row>`)
    .join("");
  return `<Worksheet ss:Name="${xmlText(name)}"><Table>${xmlRows}</Table></Worksheet>`;
}

function textCell(value: string, style?: "h"): string {
  const styleAttr = style ? ` ss:StyleID="${style}"` : "";
  return `<Cell${styleAttr}><Data ss:Type="String">${xmlText(value)}</Data></Cell>`;
}

function numberCell(value: number): string {
  return `<Cell ss:StyleID="n"><Data ss:Type="Number">${formatNumber(value)}</Data></Cell>`;
}

function formulaNumber(formula: string, value: number): string {
  return `<Cell ss:StyleID="n" ss:Formula="${xmlText(toR1C1(formula))}"><Data ss:Type="Number">${formatNumber(value)}</Data></Cell>`;
}

/** SpreadsheetML の数式は R1C1。A1 のまま出すと 'D3' という名前になる。 */
function toR1C1(formula: string): string {
  return formula.replace(/[A-Z]+\d+/g, (cell) => {
    const match = /^([A-Z]+)(\d+)$/.exec(cell);
    if (!match) return cell;
    return `R${match[2]}C${columnIndex(match[1])}`;
  });
}

function columnIndex(letters: string): number {
  let index = 0;
  for (const letter of letters) index = index * 26 + (letter.charCodeAt(0) - 64);
  return index;
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
