import { findAccountBaseBalance } from "@/lib/money";
import type { AssetAccount, AssetAccountKind } from "@/lib/types";

export type BalanceMovement = {
  date: string;
  amount: number;
  kind: "expense" | "income" | string;
  asset_account_id: string | null;
};

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
      let balance = base.balance;
      let appliedIncome = 0;
      let appliedExpense = 0;
      for (const row of movements) {
        if (row.asset_account_id !== account.id) continue;
        // 手入力した日は込み済み。今日より先の予定は残高に入れない。
        if (row.date <= base.asOf || row.date > asOfCap) continue;
        if (row.kind === "income") {
          balance += row.amount;
          appliedIncome += row.amount;
        } else {
          balance -= row.amount;
          appliedExpense += row.amount;
        }
      }
      return {
        id: account.id,
        name: account.name,
        kind: account.kind,
        balance,
        baseline: base.balance,
        asOf: base.asOf,
        appliedIncome,
        appliedExpense,
      };
    });
}
