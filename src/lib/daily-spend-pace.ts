/**
 * 毎日の支出ペース目安。
 * マキコ休み ∩ 会社休日（土日 または 平日の会社休）は支出が多め、という相対比率だけを使う。
 * （例の 1000円/5000円 などはイメージであり、日額基準値には使わない）
 */

export type PaceTone = "ok" | "warn" | "danger" | "deficit";

/** 通常日の相対ウェイト */
export const DAILY_PACE_WEIGHT_NORMAL = 1;
/** マキコ休みかつ会社休日の相対ウェイト（イメージ比 1:5） */
export const DAILY_PACE_WEIGHT_OVERLAP = 5;

export function toDateSet(dates: Iterable<string>): Set<string> {
  return dates instanceof Set ? dates : new Set(dates);
}

/** 会社休日か（土日、または平日に付けた会社休「休」） */
export function isCompanyHolidayDay(
  dateKey: string,
  companyHolidays: Iterable<string>,
): boolean {
  const hol = toDateSet(companyHolidays);
  if (hol.has(dateKey)) return true;
  const [y, m, d] = dateKey.split("-").map(Number);
  if (!y || !m || !d) return false;
  const dow = new Date(y, m - 1, d).getDay();
  return dow === 0 || dow === 6;
}

/** その日のペース用ウェイト（金額ではない） */
export function dayPaceWeight(
  dateKey: string,
  companyHolidays: Iterable<string>,
  makikoOffs: Iterable<string>,
): number {
  const mak = toDateSet(makikoOffs);
  if (mak.has(dateKey) && isCompanyHolidayDay(dateKey, companyHolidays)) {
    return DAILY_PACE_WEIGHT_OVERLAP;
  }
  return DAILY_PACE_WEIGHT_NORMAL;
}

export type MonthPaceWeights = {
  /** 1日目から順のウェイト */
  weights: number[];
  totalWeight: number;
  /** その日までの累積ウェイト（1日目＝weights[0]） */
  cumulativeThrough: number[];
};

export function buildMonthPaceWeights(
  monthKey: string,
  companyHolidays: Iterable<string>,
  makikoOffs: Iterable<string>,
): MonthPaceWeights {
  const [y, m] = monthKey.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const hol = toDateSet(companyHolidays);
  const mak = toDateSet(makikoOffs);
  const weights: number[] = [];
  const cumulativeThrough: number[] = [];
  let sum = 0;
  for (let d = 1; d <= lastDay; d++) {
    const key = `${monthKey}-${String(d).padStart(2, "0")}`;
    const w = dayPaceWeight(key, hol, mak);
    weights.push(w);
    sum += w;
    cumulativeThrough.push(sum);
  }
  return { weights, totalWeight: sum, cumulativeThrough };
}

/** ウェイト進捗に基づく目安残高 */
export function expectedRemainingByWeight(
  budget: number,
  cumulativeWeightThroughDay: number,
  totalWeight: number,
): number {
  if (totalWeight <= 0) return budget;
  return Math.round(
    budget * (1 - cumulativeWeightThroughDay / totalWeight),
  );
}

export function paceToneFromGap(
  gap: number,
  budget: number,
  remaining: number,
): PaceTone {
  if (remaining < 0) return "deficit";
  if (gap >= 0) return "ok";
  if (gap >= -Math.max(2000, budget * 0.08)) return "warn";
  return "danger";
}
