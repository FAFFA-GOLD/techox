/** 金額から「○00円代」の下限を返す（例: 580 → 500） */
export function lunchPriceBand(amount: number): number {
  if (!Number.isFinite(amount) || amount < 0) return 0;
  return Math.floor(amount / 100) * 100;
}

export function lunchPriceBandLabel(band: number): string {
  return `${band}円代`;
}

export type LunchMenuLike = {
  id: string;
  amount: number;
};

export type LunchBandDayPlanRow = {
  band: number;
  days: number;
  /** 帯内メニューの平均単価（四捨五入） */
  avgUnit: number;
  sum: number;
};

/**
 * 日数と希望合計に対し、希望を超えない範囲でできるだけ近づけた
 * 「価格帯ごとの日数」構成を返す（帯の単価は登録メニュー平均）。
 *
 * 方針: 全日を最安帯から始め、希望を超えない「1日の帯上げ」を
 * ランダムに繰り返す。押すたびに別の構成になり得る。
 */
export function planLunchBandDays(
  items: LunchMenuLike[],
  days: number,
  targetAmount: number,
  random: () => number = Math.random,
): {
  rows: LunchBandDayPlanRow[];
  total: number;
  target: number;
  feasibleUnderTarget: boolean;
  minTotal: number;
  maxTotal: number;
  bandOptionCount: number;
} {
  const byBand = new Map<number, number[]>();
  for (const item of items) {
    const band = lunchPriceBand(item.amount);
    const list = byBand.get(band) ?? [];
    list.push(item.amount);
    byBand.set(band, list);
  }

  const bands = [...byBand.keys()].sort((a, b) => a - b);
  const avgByBand = new Map<number, number>();
  for (const b of bands) {
    const amounts = byBand.get(b) ?? [];
    const avg = amounts.reduce((s, n) => s + n, 0) / amounts.length;
    avgByBand.set(b, Math.round(avg));
  }

  const empty = {
    rows: [] as LunchBandDayPlanRow[],
    total: 0,
    target: targetAmount,
    feasibleUnderTarget: false,
    minTotal: 0,
    maxTotal: 0,
    bandOptionCount: 0,
  };

  const target = Math.round(Number(targetAmount));
  if (days <= 0 || bands.length === 0 || !Number.isFinite(target) || target <= 0) {
    return empty;
  }

  const units = bands
    .map((b) => ({ band: b, avg: avgByBand.get(b) ?? b }))
    .sort((a, b) => a.avg - b.avg || a.band - b.band);

  const dayCounts = units.map(() => 0);
  dayCounts[0] = days;
  let total = units[0].avg * days;
  const minTotal = total;
  const maxTotal = units[units.length - 1].avg * days;

  type Upgrade = { from: number; to: number; gain: number };
  const maxSteps = days * Math.max(units.length, 1) + 5;

  for (let step = 0; step < maxSteps; step++) {
    const options: Upgrade[] = [];
    for (let from = 0; from < units.length; from++) {
      if (dayCounts[from] <= 0) continue;
      for (let to = from + 1; to < units.length; to++) {
        const gain = units[to].avg - units[from].avg;
        if (gain <= 0) continue;
        if (total + gain > target) continue;
        options.push({ from, to, gain });
      }
    }
    if (options.length === 0) break;

    // 希望に近づく上げを多めにしつつ、毎回ランダムに選ぶ
    const maxGain = Math.max(...options.map((o) => o.gain));
    const weighted = options.map((o) => ({
      ...o,
      // 値上げ幅が大きいほど重み大（最低1）
      weight: 1 + o.gain / Math.max(maxGain, 1),
    }));
    const weightSum = weighted.reduce((s, o) => s + o.weight, 0);
    let r = random() * weightSum;
    let chosen = weighted[weighted.length - 1];
    for (const o of weighted) {
      r -= o.weight;
      if (r <= 0) {
        chosen = o;
        break;
      }
    }

    dayCounts[chosen.from] -= 1;
    dayCounts[chosen.to] += 1;
    total += chosen.gain;
  }

  // まだ余裕があるとき、同じ合計付近の別構成を少し混ぜるため
  // 「下げてから別の上げ」を数回ランダム試行
  const reshuffleTries = Math.min(40, days * 2);
  for (let t = 0; t < reshuffleTries; t++) {
    const fromCandidates: number[] = [];
    for (let i = 1; i < units.length; i++) {
      if (dayCounts[i] > 0) fromCandidates.push(i);
    }
    if (fromCandidates.length === 0) break;

    const from = fromCandidates[Math.floor(random() * fromCandidates.length)];
    // 1日分を一段以上下げる
    const lowerOptions: number[] = [];
    for (let j = 0; j < from; j++) lowerOptions.push(j);
    if (lowerOptions.length === 0) continue;
    const downTo = lowerOptions[Math.floor(random() * lowerOptions.length)];
    const drop = units[from].avg - units[downTo].avg;
    if (drop <= 0) continue;

    dayCounts[from] -= 1;
    dayCounts[downTo] += 1;
    total -= drop;

    // 下げた分、別の上げで穴埋め（希望以下で最大付近）
    const upOptions: Upgrade[] = [];
    for (let a = 0; a < units.length; a++) {
      if (dayCounts[a] <= 0) continue;
      for (let b = a + 1; b < units.length; b++) {
        const gain = units[b].avg - units[a].avg;
        if (gain <= 0) continue;
        if (total + gain > target) continue;
        upOptions.push({ from: a, to: b, gain });
      }
    }
    if (upOptions.length === 0) {
      // 戻せない上げが無いなら下げを取り消す
      dayCounts[from] += 1;
      dayCounts[downTo] -= 1;
      total += drop;
      continue;
    }
    const up = upOptions[Math.floor(random() * upOptions.length)];
    dayCounts[up.from] -= 1;
    dayCounts[up.to] += 1;
    total += up.gain;
  }

  const rows: LunchBandDayPlanRow[] = [];
  for (let i = 0; i < units.length; i++) {
    if (dayCounts[i] <= 0) continue;
    const avgUnit = units[i].avg;
    rows.push({
      band: units[i].band,
      days: dayCounts[i],
      avgUnit,
      sum: avgUnit * dayCounts[i],
    });
  }
  rows.sort((a, b) => a.band - b.band);

  return {
    rows,
    total,
    target,
    feasibleUnderTarget: total <= target,
    minTotal,
    maxTotal,
    bandOptionCount: units.length,
  };
}

/**
 * 価格帯の比率に従い、日数ぶんランダムに選んだ昼食の合計を返す。
 * 比率が無い帯は除外。候補が無い帯も除外。
 * bandCounts は今回の抽選で各価格帯が何回選ばれたか（押すたびに変わり得る）。
 */
export function simulateLunchMonthTotal(
  items: LunchMenuLike[],
  days: number,
  bandPercents: Record<number, number>,
  random: () => number = Math.random,
): {
  total: number;
  picks: LunchMenuLike[];
  usedBands: number[];
  bandCounts: Record<number, number>;
  bandSums: Record<number, number>;
} {
  const byBand = new Map<number, LunchMenuLike[]>();
  for (const item of items) {
    const band = lunchPriceBand(item.amount);
    const list = byBand.get(band) ?? [];
    list.push(item);
    byBand.set(band, list);
  }

  const bands = [...byBand.keys()].filter((b) => (bandPercents[b] ?? 0) > 0);
  const weightSum = bands.reduce((s, b) => s + (bandPercents[b] ?? 0), 0);
  if (days <= 0 || bands.length === 0 || weightSum <= 0) {
    return {
      total: 0,
      picks: [],
      usedBands: bands,
      bandCounts: {},
      bandSums: {},
    };
  }

  const picks: LunchMenuLike[] = [];
  const bandCounts: Record<number, number> = {};
  const bandSums: Record<number, number> = {};
  let total = 0;
  for (let i = 0; i < days; i++) {
    let r = random() * weightSum;
    let chosenBand = bands[bands.length - 1];
    for (const b of bands) {
      r -= bandPercents[b] ?? 0;
      if (r <= 0) {
        chosenBand = b;
        break;
      }
    }
    const pool = byBand.get(chosenBand) ?? [];
    const pick = pool[Math.floor(random() * pool.length)];
    if (!pick) continue;
    picks.push(pick);
    total += pick.amount;
    const pickBand = lunchPriceBand(pick.amount);
    bandCounts[pickBand] = (bandCounts[pickBand] ?? 0) + 1;
    bandSums[pickBand] = (bandSums[pickBand] ?? 0) + pick.amount;
  }

  return { total, picks, usedBands: bands, bandCounts, bandSums };
}

/** 帯ごとの件数から均等比率の初期値を作る */
export function defaultLunchBandPercents(
  items: LunchMenuLike[],
): Record<number, number> {
  const bands = [
    ...new Set(items.map((i) => lunchPriceBand(i.amount))),
  ].sort((a, b) => a - b);
  if (bands.length === 0) return {};
  const each = Math.floor(100 / bands.length);
  const result: Record<number, number> = {};
  let assigned = 0;
  bands.forEach((b, idx) => {
    if (idx === bands.length - 1) {
      result[b] = 100 - assigned;
    } else {
      result[b] = each;
      assigned += each;
    }
  });
  return result;
}
