/** 家計アプリの「今日」は日本時間基準（Vercel 本番は UTC のため） */
export const APP_TIME_ZONE = "Asia/Tokyo";

/** yyyy-MM-dd（指定タイムゾーンの今日） */
export function todayKeyInTimeZone(tz = APP_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
}

/** yyyy-MM */
export function monthKeyInTimeZone(tz = APP_TIME_ZONE): string {
  return todayKeyInTimeZone(tz).slice(0, 7);
}

/** カレンダー表示月の既定選択日（当月なら今日、それ以外は月初） */
export function defaultSelectedDateForMonth(
  monthKey: string,
  tz = APP_TIME_ZONE,
): string {
  const today = todayKeyInTimeZone(tz);
  const todayMonth = today.slice(0, 7);
  return monthKey === todayMonth ? today : `${monthKey}-01`;
}
