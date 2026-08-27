/** 四則演算のみの安全な評価（メモ・計算スペース用） */
export function evalArithmetic(raw: string): number | null {
  const expr = raw.replace(/,/g, "").replace(/￥|¥|円/g, "").trim();
  if (!expr) return null;
  if (!/^[\d\s+\-*/().]+$/.test(expr)) return null;
  if (/[+\-*/.]{2,}/.test(expr.replace(/\s/g, ""))) return null;
  try {
    // eslint-disable-next-line no-new-func
    const value = Function(`"use strict"; return (${expr});`)();
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    return Math.round(value * 100) / 100;
  } catch {
    return null;
  }
}

/** メモ内の「… =」行に結果を追記（既に数値がある行はスキップ） */
export function fillMemoCalculations(body: string): string {
  return body
    .split(/\r?\n/)
    .map((line) => {
      const m = line.match(/^(.+?)=\s*([\d,.\-]*)\s*$/);
      if (!m) return line;
      if (m[2] !== "" && m[2] != null) return line;
      const left = m[1].trim();
      // 「380円 × 20日」のような日本語記号を演算子へ
      const normalized = left
        .replace(/×|ｘ|x/gi, "*")
        .replace(/÷/g, "/")
        .replace(/＋/g, "+")
        .replace(/－|−/g, "-")
        .replace(/[^\d+\-*/().\s]/g, " ");
      const value = evalArithmetic(normalized);
      if (value == null) return line;
      const shown = Number.isInteger(value)
        ? String(value)
        : String(value);
      return `${m[1].trimEnd()}= ${shown}`;
    })
    .join("\n");
}
