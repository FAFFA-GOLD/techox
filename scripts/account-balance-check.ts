import { buildAccountBalanceViews } from "../src/lib/account-display";
import type { AssetAccount } from "../src/lib/types";

const account = {
  id: "rpay",
  name: "R-PAY",
  kind: "emoney",
  archived: false,
} as AssetAccount;

const savedAt = "2026-11-03T01:00:00.000Z";
const views = buildAccountBalanceViews(
  [account],
  [
    {
      asset_account_id: "rpay",
      as_of_date: "2026-11-03",
      balance: 5000,
      created_at: savedAt,
      updated_at: savedAt,
    },
  ],
  [
    {
      date: "2026-11-03",
      amount: 800,
      kind: "expense",
      asset_account_id: "rpay",
      created_at: "2026-11-03T00:30:00.000Z",
    },
    {
      date: "2026-11-03",
      amount: 1200,
      kind: "expense",
      asset_account_id: "rpay",
      created_at: "2026-11-03T02:00:00.000Z",
    },
    {
      date: "2026-11-04",
      amount: 300,
      kind: "expense",
      asset_account_id: "rpay",
      created_at: "2026-11-03T03:00:00.000Z",
    },
  ],
  "2026-11-04",
);

const balance = views[0]?.balance;
if (balance !== 5000 - 1200 - 300) {
  console.error("balance", balance);
  process.exit(1);
}
console.log("ok", balance);
