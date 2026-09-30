import "server-only";

import { ensurePdfNodeDomGlobals } from "@/lib/pdf-node-shim";
import fs from "fs/promises";
import path from "path";
import {
  parsePayslipFilename,
  parsePayslipText,
  type PayslipFileInfo,
  type PayslipParseResult,
} from "@/lib/payslip-parse";

export type {
  PayslipFileInfo,
  PayslipLine,
  PayslipParseResult,
} from "@/lib/payslip-parse";
export {
  PAYSLIP_MEMO_PREFIX,
  isPayslipMemo,
  parsePayslipFilename,
  parsePayslipText,
  payslipMemo,
  summarizeBasePay,
} from "@/lib/payslip-parse";

const DATA_DIR = path.join(process.cwd(), "data");

export async function listPayslipFiles(): Promise<PayslipFileInfo[]> {
  try {
    const names = await fs.readdir(DATA_DIR);
    return names
      .filter((n) => n.toLowerCase().endsWith(".pdf") && n.includes("給与明細"))
      .map(parsePayslipFilename)
      .sort((a, b) => b.filename.localeCompare(a.filename));
  } catch {
    return [];
  }
}

export async function readPayslipFile(filename: string): Promise<Uint8Array> {
  const info = parsePayslipFilename(filename);
  if (!info.filename || info.filename !== path.basename(filename)) {
    throw new Error("ファイル名が不正です");
  }
  if (
    !info.filename.toLowerCase().endsWith(".pdf") ||
    !info.filename.includes("給与明細")
  ) {
    throw new Error("給与明細PDFを指定してください");
  }
  const full = path.join(DATA_DIR, info.filename);
  const resolved = path.resolve(full);
  if (!resolved.startsWith(path.resolve(DATA_DIR))) {
    throw new Error("不正なパスです");
  }
  return new Uint8Array(await fs.readFile(resolved));
}

export async function savePayslipFile(
  bytes: Uint8Array,
  preferredName?: string,
): Promise<string> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  let name = preferredName ? path.basename(preferredName) : "";
  if (!name.toLowerCase().endsWith(".pdf")) {
    name = `${name || "payslip"}.pdf`;
  }
  if (!name.includes("給与明細")) {
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "_");
    name = `${stamp}_給与明細.pdf`;
  }
  const full = path.join(DATA_DIR, name);
  await fs.writeFile(full, bytes);
  return name;
}

export async function extractPayslipFromPdf(
  bytes: Uint8Array,
): Promise<PayslipParseResult> {
  ensurePdfNodeDomGlobals();
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: bytes });
  try {
    const result = await parser.getText();
    return parsePayslipText(result.text ?? "");
  } finally {
    await parser.destroy();
  }
}
