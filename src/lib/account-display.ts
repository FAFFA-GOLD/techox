import type { AssetAccount, AssetAccountKind } from "@/lib/types";

function dayKey(value: string): string {
  return String(value).slice(0, 10);
}

function latestSnapshot<T extends { asset_account_id: string; as_of_date: string }>(
  accountId: string,
  snapshots: T[],
  asOfCap: string,
): T | null {
  const eligible = snapshots
    .filter((snap) => snap.asset_account_id === accountId && dayKey(snap.as_of_date) <= asOfCap)
    .sort((a, b) => dayKey(b.as_of_date).localeCompare(dayKey(a.as_of_date)));
  return eligible[0] ?? null;
}

export type BalanceMovement = {
  date: string;
  amount: number;
  kind: "expense" | "income" | string;
  asset_account_id: string | null;
  /** 記録を作った時刻。残高を保存したあとなら、同じ日でも部門から引く */
  created_at?: string | null;
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
  /** 手入力よりあとに足した収入 */
  appliedIncome: number;
  /** 手入力よりあとに引いた支出 */
  appliedExpense: number;
};

export function buildAccountBalanceViews(
  accounts: AssetAccount[],
  snapshots: {
    asset_account_id: string;
    as_of_date: string;
    balance: number;
    created_at?: string | null;
    updated_at?: string | null;
  }[],
  movements: BalanceMovement[],
  asOfCap: string,
): AccountBalanceView[] {
  const cap = dayKey(asOfCap);
  return accounts
    .filter((a) => !a.archived)
    .map((account) => {
      const base = latestSnapshot(account.id, snapshots, cap);
      if (!base) {
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
      const asOf = dayKey(base.as_of_date);
      const savedAt = base.updated_at ?? base.created_at ?? null;
      let balance = baseline;
      let appliedIncome = 0;
      let appliedExpense = 0;
      for (const row of movements) {
        if (row.asset_account_id !== account.id) continue;
        const date = dayKey(row.date);
        if (date > cap) continue;
        // 手入力より前の同じ日は、その金額に入っている。保存よりあとの記録と翌日以降だけ足し引きする。
        if (date < asOf) continue;
        if (date === asOf && !(row.created_at && savedAt && row.created_at > savedAt)) continue;
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
        asOf,
        appliedIncome,
        appliedExpense,
      };
    });
}
