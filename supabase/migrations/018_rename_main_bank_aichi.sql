-- Rename default main bank label: メインバンク → あいち銀行
-- is_main は当面維持（将来メイン変更の予定あり）

update public.asset_accounts
set
  name = 'あいち銀行',
  updated_at = now()
where is_main = true
  and name = 'メインバンク';
