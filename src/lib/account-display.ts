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
  /** 未登録のとき null */
  balance: number | null;
  asOf: string | null;
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
          asOf: null,
        };
      }
      let balance = base.balance;
      for (const row of movements) {
        if (row.asset_account_id !== account.id) continue;
        if (row.date <= base.asOf) continue;
        if (row.kind === "income") balance += row.amount;
        else balance -= row.amount;
      }
      return {
        id: account.id,
        name: account.name,
        kind: account.kind,
        balance,
        asOf: base.asOf,
      };
    });
}
