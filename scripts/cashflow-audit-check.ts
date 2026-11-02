import { payPeriodsFrom } from "../src/lib/pay-period";
import { buildCashflowRows, type CashflowAuditLine } from "../src/lib/cashflow-forecast";
import { buildCashflowWorkbookXml, cashflowWorkbookGaps } from "../src/lib/cashflow-workbook";
import type { ScheduledRule } from "../src/lib/types";

const periods = payPeriodsFrom("2026-10-30", 3);
const today = "2026-11-02";
const now = periods[0];
const next = periods[1];
const accounts = [
  { id: "aichi", name: "あいち銀行", balance: 100000, savings: false },
  { id: "docomo", name: "ドコモ銀行", balance: 50119, savings: false },
  { id: "rpay", name: "R-PAY", balance: 5000, savings: false },
  { id: "suica", name: "Suica", balance: 2000, savings: false },
  { id: "mine", name: "自分", balance: 19017, savings: true },
];
const opening = accounts.reduce((sum, account) => sum + account.balance, 0);

function rule(id: string, name: string, flow: "income" | "expense"): ScheduledRule {
  return {
    id,
    user_id: "u",
    name,
    schedule_kind: "recurring",
    flow,
    amount: 1,
    day_of_month: 1,
    interval_months: 1,
    start_date: "2020-01-01",
    end_date: "2020-01-02",
    asset_account_id: null,
    category_id: null,
    created_at: "",
    updated_at: "",
  };
}

const rules = [
  rule("salary", "給与", "income"),
  rule("ad", "広告収入", "income"),
  rule("jcb", "JCB", "expense"),
  rule("home", "家へ", "expense"),
];

const events = [
  { date: "2026-11-02", amount: 999, kind: "expense" as const, categoryName: "雑費以外", scheduledRuleId: "jcb", accountId: "docomo", label: "今日の引き落とし" },
  { date: "2026-11-15", amount: 180000, kind: "income" as const, categoryName: null, scheduledRuleId: "salary", accountId: "aichi", label: "給与" },
  { date: "2026-11-28", amount: 12000, kind: "income" as const, categoryName: null, scheduledRuleId: "ad", accountId: "docomo", label: "広告収入" },
  { date: "2026-11-10", amount: 39000, kind: "expense" as const, categoryName: null, scheduledRuleId: "jcb", accountId: "docomo", label: "JCB" },
  { date: "2026-11-05", amount: 50000, kind: "expense" as const, categoryName: null, scheduledRuleId: "home", accountId: "docomo", label: "家へ" },
  { date: "2026-11-20", amount: 800, kind: "expense" as const, categoryName: "昼食", scheduledRuleId: null, accountId: "rpay", label: "昼食" },
  { date: next.start, amount: 180000, kind: "income" as const, categoryName: null, scheduledRuleId: "salary", accountId: "aichi", label: "給与" },
  { date: next.end, amount: 39000, kind: "expense" as const, categoryName: null, scheduledRuleId: "jcb", accountId: "docomo", label: "JCB" },
];

function check(label: string, useAllocation: boolean) {
  const audit: { lines: CashflowAuditLine[] } = { lines: [] };
  const rows = buildCashflowRows({
    today,
    periods,
    opening,
    events,
    rules,
    skips: [],
    base: { daily: 40000, transport: 3000, adjustment: 0 },
    overrides: [],
    spentDaily: 5000,
    spentTransport: 0,
    accounts,
    allocations: useAllocation
      ? [
          { ruleId: "salary", accountId: "aichi", amount: 70000 },
          { ruleId: "salary", accountId: "docomo", amount: 50000 },
          { ruleId: "ad", accountId: "docomo", amount: 12000 },
        ]
      : [],
    periodAllocations: [],
    dailyAccountId: useAllocation ? "rpay" : null,
    transportAccountId: useAllocation ? "suica" : null,
    audit,
  });
  const gaps = cashflowWorkbookGaps({ rows, lines: audit.lines, accounts });
  const current = audit.lines.filter((line) => line.periodStart === now.start);
  const salary = current.filter((line) => line.kind === "給料").reduce((sum, line) => sum + line.amount, 0);
  const ad = current.filter((line) => line.kind === "広告収入").reduce((sum, line) => sum + line.amount, 0);
  const fixed = current.filter((line) => line.kind === "固定費");
  const fixedNames = fixed.map((line) => line.item).sort();
  const todayHit = audit.lines.some((line) => line.date === today);
  const lunch = audit.lines.some((line) => line.item.includes("昼食"));
  if (salary !== 180000) gaps.push(`${label} 給料 ${salary}`);
  if (ad !== 12000) gaps.push(`${label} 広告 ${ad}`);
  if (!fixedNames.some((name) => name.includes("JCB")) || !fixedNames.some((name) => name.includes("家へ"))) {
    gaps.push(`${label} 固定費 ${fixedNames.join(",")}`);
  }
  if (fixed.reduce((sum, line) => sum + line.amount, 0) !== -89000) gaps.push(`${label} 固定費合計`);
  if (todayHit) gaps.push(`${label} 今日の支出が入りました`);
  if (lunch) gaps.push(`${label} 昼食が固定費に入りました`);
  const row = rows.find((item) => item.period.start === now.start);
  if (!row || row.ending !== opening + 180000 + 12000 - 89000 - 35000 - 3000) {
    gaps.push(`${label} 期末 ${row?.ending}`);
  }
  const xml = buildCashflowWorkbookXml({ today, rows, lines: audit.lines, accounts });
  const sheets = xml.match(/<Worksheet /g) ?? [];
  if (sheets.length !== 5) gaps.push(`${label} シート ${sheets.length}`);
  if (!xml.includes("家へ") || !xml.includes("JCB")) gaps.push(`${label} 明細の固定費`);
  if (!xml.includes("=D2+E2+F2+G2+H2+I2+J2+K2+L2")) gaps.push(`${label} 期末の足し算`);
  if (xml.includes("SUMIF") || xml.includes("サム")) gaps.push(`${label} 関数名`);
  if (gaps.length > 0) {
    console.error(label, gaps);
    process.exitCode = 1;
  } else {
    console.log(`${label} ok ${row?.ending}`);
  }
}

check("割り振りあり", true);
check("割り振りなし", false);
