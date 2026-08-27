import { assetAccountKindLabel } from "@/lib/types";
import type { AssetAccount } from "@/lib/types";

type Props = {
  accounts: AssetAccount[];
  name?: string;
  defaultValue?: string | null;
  label?: string;
  className?: string;
  hint?: boolean;
};

/** 引落／入金口座セレクト。空欄はメイン口座（is_main）扱い。 */
export function AssetAccountSelect({
  accounts,
  name = "asset_account_id",
  defaultValue = "",
  label = "引落・入金口座",
  className = "grid gap-1 text-sm sm:col-span-2",
  hint = true,
}: Props) {
  const main = accounts.find((a) => a.is_main);
  const mainLabel = main?.name ?? "メイン口座";
  return (
    <label className={className}>
      <span className="text-muted">{label}</span>
      <select
        name={name}
        defaultValue={defaultValue ?? ""}
        className="rounded-md border border-line bg-white px-3 py-2"
      >
        <option value="">メイン（未指定）· {mainLabel}</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {assetAccountKindLabel(a.kind)} · {a.name}
            {a.is_main ? "（メイン）" : ""}
          </option>
        ))}
      </select>
      {hint ? (
        <span className="text-xs text-muted">
          未選択時はメイン口座（{mainLabel}）に紐づきます
        </span>
      ) : null}
    </label>
  );
}
