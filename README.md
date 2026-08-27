# TECHOox（テチョクス）— 家計の手帖

給料サイクルで将来までのキャッシュフローを把握し、日々の予算を日常化する家計簿 Web アプリです。  
**赤字の毒を出す、家計の手帖。** 開発者自身が使いながら改善し、再スタートの実践にも使います。

| 正式名 | 読み | コード・URL向け |
|--------|------|----------------|
| **TECHOox** | テチョクス | `techoox` |

方針・変更記録: [`docs/VISION.md`](docs/VISION.md) · [`docs/CHANGELOG.md`](docs/CHANGELOG.md) · [`docs/SPEC_2026-07-23.md`](docs/SPEC_2026-07-23.md) · [`docs/HANDOFF_2026-07-30.md`](docs/HANDOFF_2026-07-30.md)（別AI引き継ぎ）

## 考え方

- **給与期** = 給料日 〜 次の給料日前日（例: 6/30給料 → 7/29までの支出をその給料で賄う）
- カレンダー月ではなく給与期で集計・予測します（設定で給料日を変更可）
- クレジットカードは**予定額を登録**すると毎月の引落に自動展開。各月で実額確定・修正（削除すると予定に戻る）
- ローンは毎月の返済＋利息を登録し、将来の給与期に自動展開

## 機能

- 給与期ダッシュボード（収入・通常支出・カード・ローン・期末残高、グラフ＋貯金目安アラート）
- 給与明細 PDF 取込（概算給与を振込額で置き換え、支給・控除の内訳表示）
- 日別残高推移（登録残高との差でずれ箇所を確認）
- 給与期ごとの CSV 出力（既定 Shift_JIS / `encoding=utf8` 可）
- 日々の支出カレンダー（家族・昼食・日用・交通費の月予算と残り、休日設定、1日複数入力、ペースバッジ）
- カレンダー下のメモ・計算スペース（安い店・単価×日数などの下書き）
- 日々支出の月次 CSV / PDF（明細書）出力、用途別グラフ・比較月
- 明細・項目・定期ルール（追加・編集・削除）
- 明細の月次 CSV 出力／読み込み（その月を上書き。初期・一括整理用）
- クレジットカード（締め日・引落日、引落予定の手入力）
- 銀行ローン
- 長期キャッシュフロー（12〜60給与期、グラフ＋資金ショート/安全余力/貯金達成アラート）

## セットアップ

### 1. Supabase 専用プロジェクト

1. [Supabase](https://supabase.com) で **新しいプロジェクト** を作成（既存ブログ用とは別）
2. SQL Editor で次を**順に**実行
   - [`supabase/migrations/001_initial.sql`](supabase/migrations/001_initial.sql)
   - [`supabase/migrations/002_cashflow.sql`](supabase/migrations/002_cashflow.sql)
   - [`supabase/migrations/003_card_defaults.sql`](supabase/migrations/003_card_defaults.sql)
   - [`supabase/migrations/004_loan_payments.sql`](supabase/migrations/004_loan_payments.sql)
   - [`supabase/migrations/005_daily_spend.sql`](supabase/migrations/005_daily_spend.sql)
   - [`supabase/migrations/006_daily_spend_unique.sql`](supabase/migrations/006_daily_spend_unique.sql)
   - [`supabase/migrations/007_daily_spend_holidays.sql`](supabase/migrations/007_daily_spend_holidays.sql)
   - [`supabase/migrations/008_daily_spend_points.sql`](supabase/migrations/008_daily_spend_points.sql)
   - [`supabase/migrations/009_payslip_imports.sql`](supabase/migrations/009_payslip_imports.sql)
   - [`supabase/migrations/010_daily_scratchpads.sql`](supabase/migrations/010_daily_scratchpads.sql)
   - [`supabase/migrations/011_scratchpad_shared.sql`](supabase/migrations/011_scratchpad_shared.sql)
   - [`supabase/migrations/012_lunch_menu_items.sql`](supabase/migrations/012_lunch_menu_items.sql)
   - [`supabase/migrations/013_ledger_scenarios.sql`](supabase/migrations/013_ledger_scenarios.sql)
   - [`supabase/migrations/014_daily_spend_makiko_offs.sql`](supabase/migrations/014_daily_spend_makiko_offs.sql)
   - [`supabase/migrations/015_asset_accounts.sql`](supabase/migrations/015_asset_accounts.sql)
   - [`supabase/migrations/016_account_transfers.sql`](supabase/migrations/016_account_transfers.sql)
   - [`supabase/migrations/017_suica_balance_snapshots.sql`](supabase/migrations/017_suica_balance_snapshots.sql)
   - [`supabase/migrations/018_rename_main_bank_aichi.sql`](supabase/migrations/018_rename_main_bank_aichi.sql)
   - [`supabase/migrations/019_add_mufg_bank.sql`](supabase/migrations/019_add_mufg_bank.sql)
3. Authentication → Providers で Email を有効化
4. Authentication → URL Configuration でローカル用を追加
   - Site URL: `http://localhost:3000`
   - Redirect URLs: `http://localhost:3000/auth/callback`
5. （任意）Confirm email をオフにすると個人利用で即ログインしやすい

### 2. 環境変数

```bash
cp .env.example .env.local
```

`Project Settings → API` の **URL** と **anon public** キーを記入:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

### 3. 起動（Windows）

エクスプローラーでプロジェクトフォルダを開き、次をダブルクリック:

1. **[`start-ledger-stable.bat`](./start-ledger-stable.bat)** … 安定版（推奨・英語ファイル名）
2. それでも窓がすぐ閉じる場合は **[`Ledger-Stable.vbs`](./Ledger-Stable.vbs)**（または [`TECHOox-Stable.vbs`](./TECHOox-Stable.vbs)）
3. 普段の開発用: [`start-ledger.bat`](./start-ledger.bat)

ブラウザで http://localhost:3000 が開きます。終了は黒い窓で `Ctrl+C`。

ターミナルから:

```bash
npm install
npm run dev
```

※ `npm run dev` は webpack 固定です（Turbopack panic 回避）。

## 使い方の流れ

1. **設定** で給料日（デフォルト: 毎月末）を確認
2. **項目** で食費・給与などを作成
3. **定期** で給与・家賃を登録（給料は「毎月月末」）
4. **カード** で締め/引落を登録し、翌月引落予定額を入力・随時編集
5. **ローン** で返済＋利息を登録
6. **給与期** で基準残高を保存し、期間の収支を確認
7. **将来** で何年先までのキャッシュアウトを一覧

## デプロイ（Vercel）

1. GitHub に push → Vercel で Import
2. 環境変数に `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` を設定
3. Supabase Authentication → URL Configuration に本番 URL を追加
   - Site URL: `https://your-app.vercel.app`
   - Redirect URLs: `https://your-app.vercel.app/auth/callback`

## ドキュメント

- 仕様・運用合意: [`docs/SPEC_2026-07-23.md`](docs/SPEC_2026-07-23.md)
- 別AI・再開用の実装詳細: [`docs/HANDOFF_2026-07-30.md`](docs/HANDOFF_2026-07-30.md)
- 変更履歴: [`docs/CHANGELOG.md`](docs/CHANGELOG.md)
- ビジョン: [`docs/VISION.md`](docs/VISION.md)
