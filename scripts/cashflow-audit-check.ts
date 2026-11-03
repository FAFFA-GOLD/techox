import { payPeriodsFrom } from "../src/lib/pay-period";
import {
  buildCashflowRows,
  DEFAULT_AICHI_OPENING,
  DEFAULT_DOCOMO_OPENING,
  DEFAULT_SALARY_RETAIN,
  type CashflowAuditLine,
} from "../src/lib/cashflow-forecast";
import { execFileSync } from "child_process";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { buildCashflowWorkbook, cashflowWorkbookGaps } from "../src/lib/cashflow-workbook";
import type { ScheduledRule } from "../src/lib/types";

const periods = payPeriodsFrom("2026-10-30", 3);
const today = "2026-11-03";
const now = periods[0];
const next = periods[1];
const accounts = [
  { id: "aichi", name: "あいち銀行" },
  { id: "docomo", name: "ドコモ銀行" },
  { id: "rpay", name: "R-PAY" },
  { id: "olive", name: "Olive銀行" },
];

function rule(id: string, name: string, flow: "income" | "expense", accountId: string | null): ScheduledRule {
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
    asset_account_id: accountId,
    category_id: null,
    created_at: "",
    updated_at: "",
  };
}

const rules = [
  rule("salary", "給与", "income", "aichi"),
  rule("ad", "広告収入", "income", "docomo"),
  rule("loan", "銀行ローン", "expense", "aichi"),
  rule("jacks", "ジャックス", "expense", "aichi"),
  rule("home", "家", "expense", "docomo"),
  rule("rakuten", "楽天銀行", "expense", "docomo"),
  rule("other", "その他引き落とし", "expense", "docomo"),
];

const events = [
  { date: "2026-10-30", amount: 300000, kind: "income" as const, categoryName: null, scheduledRuleId: "salary", accountId: "aichi", label: "給与" },
  { date: "2026-10-30", amount: 10000, kind: "income" as const, categoryName: null, scheduledRuleId: "ad", accountId: "docomo", label: "広告収入" },
  { date: "2026-11-03", amount: 64419, kind: "expense" as const, categoryName: null, scheduledRuleId: "loan", accountId: "aichi", label: "銀行ローン" },
  { date: "2026-11-10", amount: 3600, kind: "expense" as const, categoryName: null, scheduledRuleId: "jacks", accountId: "aichi", label: "ジャックス" },
  { date: "2026-11-05", amount: 50000, kind: "expense" as const, categoryName: null, scheduledRuleId: "home", accountId: "docomo", label: "家" },
  { date: "2026-11-05", amount: 42000, kind: "expense" as const, categoryName: null, scheduledRuleId: "rakuten", accountId: "docomo", label: "楽天銀行" },
  { date: "2026-11-20", amount: 10000, kind: "expense" as const, categoryName: null, scheduledRuleId: "other", accountId: "docomo", label: "その他引き落とし" },
  { date: "2026-11-12", amount: 800, kind: "expense" as const, categoryName: "昼食", scheduledRuleId: null, accountId: "rpay", label: "昼食" },
  { date: "2026-11-15", amount: 9000, kind: "expense" as const, categoryName: null, scheduledRuleId: "olive-bill", accountId: "olive", label: "Oliveの支払い" },
  { date: next.start, amount: 300000, kind: "income" as const, categoryName: null, scheduledRuleId: "salary", accountId: "aichi", label: "給与" },
  { date: next.start, amount: 8000, kind: "income" as const, categoryName: null, scheduledRuleId: "ad", accountId: "aichi", label: "広告収入" },
  { date: next.start, amount: 64419, kind: "expense" as const, categoryName: null, scheduledRuleId: "loan", accountId: "aichi", label: "銀行ローン" },
  { date: next.start, amount: 3600, kind: "expense" as const, categoryName: null, scheduledRuleId: "jacks", accountId: "aichi", label: "ジャックス" },
  { date: next.start, amount: 50000, kind: "expense" as const, categoryName: null, scheduledRuleId: "home", accountId: "docomo", label: "家" },
  { date: next.start, amount: 42000, kind: "expense" as const, categoryName: null, scheduledRuleId: "rakuten", accountId: "docomo", label: "楽天銀行" },
];

const audit: { lines: CashflowAuditLine[] } = { lines: [] };
const rows = buildCashflowRows({
  today,
  periods,
  events,
  rules,
  skips: [],
  accounts,
  banks: {
    openingPeriodStart: "2026-10-30",
    aichiOpening: DEFAULT_AICHI_OPENING,
    docomoOpening: DEFAULT_DOCOMO_OPENING,
    salaryRetain: DEFAULT_SALARY_RETAIN,
    periods: [{ periodStart: next.start, salaryRetain: null, aichiAdjustment: 0, docomoAdjustment: -1000 }],
  },
  audit,
});

const gaps = cashflowWorkbookGaps(rows);
const current = rows.find((row) => row.period.start === now.start);
const following = rows.find((row) => row.period.start === next.start);
const aichiEnding = 75599 + 60000 + 10000 - 64419 - 3600;
const docomoEnding = 27093 + 240000 - 50000 - 42000 - 10000;
if (!current || current.aichi.opening !== 75599 || current.docomo.opening !== 27093) {
  gaps.push(`期首 ${current?.aichi.opening} ${current?.docomo.opening}`);
}
if (!current || current.aichi.ending !== aichiEnding) gaps.push(`あいち期末 ${current?.aichi.ending} 期待 ${aichiEnding}`);
if (!current || current.docomo.ending !== docomoEnding) gaps.push(`ドコモ期末 ${current?.docomo.ending} 期待 ${docomoEnding}`);
if (!current || current.aichi.salary !== 60000 || current.docomo.salary !== 240000) {
  gaps.push(`給料配分 ${current?.aichi.salary} ${current?.docomo.salary}`);
}
if (current?.items.some((item) => item.item.includes("昼食"))) gaps.push("昼食が入りました");
if (current?.outside.some((item) => item.item.includes("Olive")) !== true) gaps.push("Oliveが対象外に出ていません");
if (following?.aichi.opening !== aichiEnding || following?.docomo.opening !== docomoEnding) {
  gaps.push("翌月の期首が前期末ではありません");
}
const nextAichi = aichiEnding + 60000 + 8000 - 64419 - 3600;
const nextDocomo = docomoEnding + 240000 - 50000 - 42000 - 1000;
if (following?.aichi.ending !== nextAichi) gaps.push(`翌月あいち ${following?.aichi.ending} 期待 ${nextAichi}`);
if (following?.docomo.ending !== nextDocomo) gaps.push(`翌月ドコモ ${following?.docomo.ending} 期待 ${nextDocomo}`);

const xlsx = buildCashflowWorkbook({ today, rows, lines: audit.lines });
const dir = mkdtempSync(join(tmpdir(), "cashflow-"));
const file = join(dir, "cashflow-check.xlsx");
writeFileSync(file, xlsx);
const names = execFileSync("unzip", ["-Z1", file], { encoding: "utf8" });
if (!names.includes("xl/worksheets/sheet1.xml") || !names.includes("xl/worksheets/sheet3.xml")) {
  gaps.push("シート");
}
const periodSheet = execFileSync("unzip", ["-p", file, "xl/worksheets/sheet1.xml"], { encoding: "utf8" });
const detailSheet = execFileSync("unzip", ["-p", file, "xl/worksheets/sheet2.xml"], { encoding: "utf8" });
if (!detailSheet.includes("家") || !detailSheet.includes("銀行ローン")) gaps.push("明細の固定費");
if (!periodSheet.includes("<f>D2+F2+H2+I2-K2+M2</f>")) gaps.push("あいち期末の式");
if (!periodSheet.includes("<f>E2+G2+J2-L2+N2</f>")) gaps.push("ドコモ期末の式");
if (!periodSheet.includes("<f>O2</f>") || !periodSheet.includes("<f>P2</f>")) gaps.push("翌月期首の参照");
if (periodSheet.includes("'D") || periodSheet.includes("R2C")) gaps.push("引用符つき参照");
if (gaps.length > 0) {
  console.error(gaps);
  process.exitCode = 1;
} else {
  console.log(`ok あいち ${aichiEnding} ドコモ ${docomoEnding}`);
}
