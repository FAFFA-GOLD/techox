export default function SetupPage() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center px-4 py-12">
      <p className="font-display text-4xl tracking-tight text-accent-deep">TECHOox</p>
      <h1 className="mt-6 font-display text-2xl">セットアップが必要です</h1>
      <ol className="mt-6 list-decimal space-y-3 pl-5 text-sm leading-relaxed text-muted">
        <li>
          Supabase で<strong className="text-ink">家計簿専用</strong>
          の新しいプロジェクトを作成する（ブログ用とは別）
        </li>
        <li>
          SQL Editor で{" "}
          <code className="rounded bg-white px-1.5 py-0.5 text-ink">
            001_initial.sql
          </code>
          →
          <code className="rounded bg-white px-1.5 py-0.5 text-ink">
            002_cashflow.sql
          </code>
          →
          <code className="rounded bg-white px-1.5 py-0.5 text-ink">
            003_card_defaults.sql
          </code>
          →
          <code className="rounded bg-white px-1.5 py-0.5 text-ink">
            004_loan_payments.sql
          </code>
          →
          <code className="rounded bg-white px-1.5 py-0.5 text-ink">
            005_daily_spend.sql
          </code>
          →
          <code className="rounded bg-white px-1.5 py-0.5 text-ink">
            006_daily_spend_unique.sql
          </code>
          →
          <code className="rounded bg-white px-1.5 py-0.5 text-ink">
            007_daily_spend_holidays.sql
          </code>
          →
          <code className="rounded bg-white px-1.5 py-0.5 text-ink">
            008_daily_spend_points.sql
          </code>
          →
          <code className="rounded bg-white px-1.5 py-0.5 text-ink">
            009_payslip_imports.sql
          </code>
          →
          <code className="rounded bg-white px-1.5 py-0.5 text-ink">
            010_daily_scratchpads.sql
          </code>
          →
          <code className="rounded bg-white px-1.5 py-0.5 text-ink">
            011_scratchpad_shared.sql
          </code>
          →
          <code className="rounded bg-white px-1.5 py-0.5 text-ink">
            012_lunch_menu_items.sql
          </code>
          →
          <code className="rounded bg-white px-1.5 py-0.5 text-ink">
            013_ledger_scenarios.sql
          </code>
          →
          <code className="rounded bg-white px-1.5 py-0.5 text-ink">
            014_daily_spend_makiko_offs.sql
          </code>
          →
          <code className="rounded bg-white px-1.5 py-0.5 text-ink">
            015_asset_accounts.sql
          </code>
          →
          <code className="rounded bg-white px-1.5 py-0.5 text-ink">
            016_account_transfers.sql
          </code>
          →
          <code className="rounded bg-white px-1.5 py-0.5 text-ink">
            017_suica_balance_snapshots.sql
          </code>
          →
          <code className="rounded bg-white px-1.5 py-0.5 text-ink">
            018_rename_main_bank_aichi.sql
          </code>
          →
          <code className="rounded bg-white px-1.5 py-0.5 text-ink">
            019_add_mufg_bank.sql
          </code>{" "}
          を順に実行する
        </li>
        <li>
          Project Settings → API から URL と anon key をコピーする
        </li>
        <li>
          プロジェクト直下に{" "}
          <code className="rounded bg-white px-1.5 py-0.5 text-ink">.env.local</code>{" "}
          を作り、次を記入する
        </li>
      </ol>
      <pre className="mt-4 overflow-x-auto rounded-xl border border-line bg-white/80 p-4 text-xs leading-6 text-ink">
{`NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...`}
      </pre>
      <p className="mt-4 text-sm text-muted">
        保存後、開発サーバーを再起動してください（
        <code className="rounded bg-white px-1">npm run dev</code>）。
      </p>
      <p className="mt-6 text-sm text-muted">
        詳細は README.md の「セットアップ」「デプロイ」を参照してください。
      </p>
    </div>
  );
}
