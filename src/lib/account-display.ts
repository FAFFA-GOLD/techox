import { findAccountBaseBalance } from "@/lib/money";
import type { AssetAccount, AssetAccountKind } from "@/lib/types";

export type BalanceMovement = {
  date: string;
  amount: number;
  kind: "expense" | "income" | string;
  asset_account_id: string | null;
};

export type AccountForecastLine = {
  label: string;
  amount: number;
  kind: "income" | "expense";
};

export type AccountForecastDay = {
  date: string;
  lines: AccountForecastLine[];
  balanceAfter: number;
};

export function forecastAccountDays(
  accountId: string,
  opening: number,
  entries: {
    date: string;
    amount: number;
    kind?: string;
    memo: string | null;
    asset_account_id?: string | null;
  }[],
  afterDate: string,
  throughDate: string,
): AccountForecastDay[] {
  const asYen = (value: unknown) => {
    const n = typeof value === "number" ? value : Number(value);
    return Number.isFinite(n) ? n : 0;
  };
  const grouped = new Map<string, AccountForecastLine[]>();
  for (const entry of entries) {
    const date = String(entry.date).slice(0, 10);
    if (entry.asset_account_id !== accountId) continue;
    if (date <= afterDate || date > throughDate) continue;
    const kind = entry.kind === "income" ? "income" : "expense";
    const lines = grouped.get(date) ?? [];
    lines.push({
      label: entry.memo?.trim() || (kind === "income" ? "収入" : "支出"),
      amount: asYen(entry.amount),
      kind,
    });
    grouped.set(date, lines);
  }
  let balance = opening;
  return [...grouped.keys()].sort().map((date) => {
    const lines = grouped.get(date) ?? [];
    for (const line of lines) {
      balance += line.kind === "income" ? line.amount : -line.amount;
    }
    return { date, lines, balanceAfter: balance };
  });
}

export type AccountBalanceView = {
  id: string;
  name: string;
  kind: AssetAccountKind;
  /** 未登録のとき null。手入力額＋その翌日〜今日の日々の記録 */
  balance: number | null;
  /** 最後に手入力した額。未登録のとき null */
  baseline: number | null;
  asOf: string | null;
  /** 手入力日の翌日〜今日までに足した収入 */
  appliedIncome: number;
  /** 手入力日の翌日〜今日までに引いた支出 */
  appliedExpense: number;
};

export function buildAccountBalanceViews(
  accounts: AssetAccount[],
  snapshots: {
    asset_account_id: string;
    as_of_date: string;
    balance: number;
  }[],
  movements: BalanceMovement[],
  asOfCap: string,
): AccountBalanceView[] {
  return accounts
    .filter((a) => !a.archived)
    .map((account) => {
      const base = findAccountBaseBalance(account.id, snapshots, asOfCap);
      if (!base.asOf) {
        return {
          id: account.id,
          name: account.name,
          kind: account.kind,
          balance: null,
          baseline: null,
          asOf: null,
          appliedIncome: 0,
          appliedExpense: 0,
        };
      }
      const asYen = (value: unknown) => {
        const n = typeof value === "number" ? value : Number(value);
        return Number.isFinite(n) ? n : 0;
      };
      const baseline = asYen(base.balance);
      let balance = baseline;
      let appliedIncome = 0;
      let appliedExpense = 0;
      for (const row of movements) {
        if (row.asset_account_id !== account.id) continue;
        // 手入力した日は込み済み。今日より先の予定は残高に入れない。
        if (row.date <= base.asOf || row.date > asOfCap) continue;
        const amount = asYen(row.amount);
        if (row.kind === "income") {
          balance += amount;
          appliedIncome += amount;
        } else {
          balance -= amount;
          appliedExpense += amount;
        }
      }
      return {
        id: account.id,
        name: account.name,
        kind: account.kind,
        balance,
        baseline,
        asOf: base.asOf,
        appliedIncome,
        appliedExpense,
      };
    });
}
