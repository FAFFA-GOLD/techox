"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  importPayslipPdf,
  previewPayslipFromData,
  previewPayslipUpload,
} from "@/app/actions";
import { formatYen } from "@/lib/money";
import {
  summarizeBasePay,
  type PayslipFileInfo,
  type PayslipParseResult,
} from "@/lib/payslip-parse";

type PreviewState = {
  source: "data" | "upload";
  filename: string;
  parsed: PayslipParseResult;
};

type Props = {
  files: PayslipFileInfo[];
};

export function PayslipImportPanel({ files }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [selectedFile, setSelectedFile] = useState(files[0]?.filename ?? "");
  const [pending, startTransition] = useTransition();

  function resetFeedback() {
    setError(null);
    setMessage(null);
  }

  return (
    <section className="grid gap-3 rounded-xl border border-line/80 bg-white/60 p-4">
      <h2 className="text-lg font-bold">給与明細取込</h2>
      <p className="text-sm text-muted">
        data フォルダに置いた「日付_給与明細.pdf」を読み取り、振込支給額で
        同日の概算給与（定期の予定・確定）を置き換えます。危険ではなく、正確な手取りに更新する想定です。
        支給・控除の内訳は取込後に上の「給与明細（取込済み）」で確認できます。
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-2">
          <p className="text-sm font-medium">data フォルダから</p>
          {files.length === 0 ? (
            <p className="text-sm text-muted">
              まだ PDF がありません。data/YYYY_MM_DD_給与明細.pdf を置いてください。
            </p>
          ) : (
            <>
              <select
                value={selectedFile}
                onChange={(e) => setSelectedFile(e.target.value)}
                className="rounded-md border border-line bg-white px-3 py-2 text-sm"
              >
                {files.map((f) => (
                  <option key={f.filename} value={f.filename}>
                    {f.filename}
                    {f.paydayFromName ? `（支給日 ${f.paydayFromName}）` : ""}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={pending || !selectedFile}
                className="w-fit rounded-md border border-line bg-white px-3 py-2 text-sm hover:bg-white disabled:opacity-60"
                onClick={() => {
                  resetFeedback();
                  startTransition(async () => {
                    const res = await previewPayslipFromData(selectedFile);
                    if ("error" in res && res.error) {
                      setError(res.error);
                      setPreview(null);
                      return;
                    }
                    if (!("parsed" in res) || !res.parsed) {
                      setError("解析結果を取得できませんでした");
                      return;
                    }
                    setPreview({
                      source: "data",
                      filename: selectedFile,
                      parsed: res.parsed,
                    });
                  });
                }}
              >
                {pending ? "解析中…" : "内容を確認"}
              </button>
            </>
          )}
        </div>

        <form
          className="grid gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            resetFeedback();
            const fd = new FormData(e.currentTarget);
            startTransition(async () => {
              const res = await previewPayslipUpload(fd);
              if ("error" in res && res.error) {
                setError(res.error);
                setPreview(null);
                return;
              }
              if (!("parsed" in res) || !res.parsed || !res.filename) {
                setError("解析結果を取得できませんでした");
                return;
              }
              setPreview({
                source: "upload",
                filename: res.filename,
                parsed: res.parsed,
              });
              if (res.savedAs) {
                setSelectedFile(res.savedAs);
              }
              router.refresh();
            });
          }}
        >
          <p className="text-sm font-medium">PDFをアップロード</p>
          <input
            name="file"
            type="file"
            accept="application/pdf,.pdf"
            required
            className="rounded-md border border-line bg-white px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-accent/10 file:px-2 file:py-1"
          />
          <button
            type="submit"
            disabled={pending}
            className="w-fit rounded-md border border-line bg-white px-3 py-2 text-sm hover:bg-white disabled:opacity-60"
          >
            {pending ? "解析中…" : "アップロードして確認"}
          </button>
        </form>
      </div>

      {preview ? (
        <div className="grid gap-3 border-t border-line/70 pt-3">
          <p className="text-sm">
            <span className="text-muted">ファイル: </span>
            {preview.filename}
          </p>
          <dl className="grid gap-1 text-sm sm:grid-cols-2">
            <div className="flex justify-between gap-2 sm:block">
              <dt className="text-muted">対象月</dt>
              <dd className="font-medium">{preview.parsed.targetLabel}</dd>
            </div>
            <div className="flex justify-between gap-2 sm:block">
              <dt className="text-muted">支給日</dt>
              <dd className="font-medium tabular-nums">{preview.parsed.payday}</dd>
            </div>
            <div className="flex justify-between gap-2 sm:block">
              <dt className="text-muted">振込支給額（取込）</dt>
              <dd className="font-semibold tabular-nums text-income">
                {formatYen(preview.parsed.netPay)}
              </dd>
            </div>
            {preview.parsed.grossPay != null ? (
              <div className="flex justify-between gap-2 sm:block">
                <dt className="text-muted">支給合計</dt>
                <dd className="tabular-nums">{formatYen(preview.parsed.grossPay)}</dd>
              </div>
            ) : null}
            {preview.parsed.deductionTotal != null ? (
              <div className="flex justify-between gap-2 sm:block">
                <dt className="text-muted">控除合計</dt>
                <dd className="tabular-nums">{formatYen(preview.parsed.deductionTotal)}</dd>
              </div>
            ) : null}
            {(() => {
              const base = summarizeBasePay(
                preview.parsed.lines,
                preview.parsed.deductionTotal,
              );
              if (base.basePlusOvertime <= 0) return null;
              return (
                <>
                  <div className="flex justify-between gap-2 sm:block">
                    <dt className="text-muted">基本給＋固定残業</dt>
                    <dd className="font-medium tabular-nums">
                      {formatYen(base.basePlusOvertime)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2 sm:block">
                    <dt className="text-muted">基本給＋固定残業 − 控除</dt>
                    <dd className="font-medium tabular-nums text-income">
                      {formatYen(base.afterDeduction)}
                    </dd>
                  </div>
                </>
              );
            })()}
          </dl>

          {preview.parsed.lines.length > 0 ? (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted">内訳（参考）</summary>
              <ul className="mt-2 grid gap-1 rounded-md border border-line/60 bg-white/70 p-3">
                {preview.parsed.lines.map((line) => (
                  <li
                    key={`${line.section}-${line.label}`}
                    className="flex justify-between gap-3"
                  >
                    <span>
                      {line.section === "deduction" ? "控除 · " : ""}
                      {line.label}
                    </span>
                    <span className="tabular-nums text-muted">
                      {formatYen(line.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          <button
            type="button"
            disabled={pending}
            className="w-fit rounded-md bg-accent px-4 py-2.5 text-sm text-white hover:bg-accent-deep disabled:opacity-60"
            onClick={() => {
              resetFeedback();
              startTransition(async () => {
                const res = await importPayslipPdf({
                  filename: preview.filename,
                });
                if ("error" in res && res.error) {
                  setError(res.error);
                  return;
                }
                setMessage(
                  `${preview.parsed.payday} に ${formatYen(preview.parsed.netPay)} を収入として取り込みました` +
                    (res && "replaced" in res && res.replaced
                      ? `（概算・前回取込 ${res.replaced} 件を置き換え）`
                      : ""),
                );
                if (res && "detailWarning" in res && res.detailWarning) {
                  setError(res.detailWarning);
                }
                setPreview(null);
                router.refresh();
              });
            }}
          >
            {pending ? "取込中…" : "振込支給額を収入として取り込む"}
          </button>
        </div>
      ) : null}

      {error ? <p className="text-sm text-expense">{error}</p> : null}
      {message ? <p className="text-sm text-income">{message}</p> : null}
    </section>
  );
}
