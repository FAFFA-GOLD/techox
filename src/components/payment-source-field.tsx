"use client";

import type { AssetAccount } from "@/lib/types";
import {
  DEFAULT_SPEND_SOURCE_NAME,
  DEFAULT_TRANSPORT_SOURCE_NAME,
  isFixedCostCategory,
  isTransportCategory,
  SPEND_SOURCE_NAMES,
  TRANSPORT_SOURCE_NAMES,
} from "@/lib/types";

export function accountsForCategory(
  accounts: AssetAccount[],
  categoryName: string,
): AssetAccount[] {
  const active = accounts.filter((a) => !a.archived);
  if (isFixedCostCategory(categoryName)) return active;
  const names = isTransportCategory(categoryName)
    ? TRANSPORT_SOURCE_NAMES
    : SPEND_SOURCE_NAMES;
  const allow = new Set<string>(names);
  return active.filter((a) => allow.has(a.name));
}

export function defaultAccountId(
  accounts: AssetAccount[],
  categoryName: string,
  current?: string | null,
): string {
  const allowed = accountsForCategory(accounts, categoryName);
  if (current && allowed.some((a) => a.id === current)) return current;
  const prefer = isTransportCategory(categoryName)
    ? DEFAULT_TRANSPORT_SOURCE_NAME
    : DEFAULT_SPEND_SOURCE_NAME;
  return allowed.find((a) => a.name === prefer)?.id ?? allowed[0]?.id ?? "";
}

export function PaymentSourceField({
  accounts,
  categoryName,
  value,
  onChange,
}: {
  accounts: AssetAccount[];
  categoryName: string;
  value: string;
  onChange: (id: string) => void;
}) {
  const options = accountsForCategory(accounts, categoryName);
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-muted">
        {isTransportCategory(categoryName) ? "減額する残高" : "支払い元"}
      </span>
      <select
        name="asset_account_id"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-md border border-line bg-white px-3 py-2"
      >
        {options.map((account) => (
          <option key={account.id} value={account.id}>
            {account.name}
          </option>
        ))}
      </select>
    </label>
  );
}
