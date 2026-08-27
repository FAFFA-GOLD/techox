import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { buildLedgerBackup } from "@/lib/backup";
import { transactionsToCsv } from "@/lib/transactions-csv";
import { encodeCsvForDownload } from "@/lib/csv";

export async function GET(request: Request) {
  const backup = await buildLedgerBackup();
  if (!backup) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const save = searchParams.get("save") === "1";
  const label = searchParams.get("label")?.replace(/[^\w\-]+/g, "_") || "manual";

  const stamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace("T", "_")
    .slice(0, 19);
  const dirName = `${stamp}_${label}`;
  const dir = path.join(process.cwd(), "backups", dirName);

  if (save) {
    await mkdir(dir, { recursive: true });
    const jsonPath = path.join(dir, "ledger-backup.json");
    await writeFile(jsonPath, JSON.stringify(backup, null, 2), "utf8");

    // Also dump monthly transaction CSVs for convenience
    const byMonth = new Map<string, typeof backup.transactions>();
    for (const t of backup.transactions) {
      const month = t.date.slice(0, 7);
      const list = byMonth.get(month) ?? [];
      list.push(t);
      byMonth.set(month, list);
    }
    for (const [month, rows] of byMonth) {
      const csv = transactionsToCsv(month, rows);
      const { body } = encodeCsvForDownload(csv, "utf8");
      await writeFile(
        path.join(dir, `transactions-${month}.csv`),
        Buffer.from(body),
      );
    }

    const meta = {
      savedAt: backup.exportedAt,
      dir: `backups/${dirName}`,
      counts: {
        transactions: backup.transactions.length,
        categories: backup.categories.length,
        recurringRules: backup.recurringRules.length,
        dailySpendEntries: backup.dailySpendEntries.length,
        creditCards: backup.creditCards.length,
        loans: backup.loans.length,
      },
    };
    await writeFile(
      path.join(dir, "README.txt"),
      [
        "TECHOox backup",
        `exportedAt: ${backup.exportedAt}`,
        `userId: ${backup.userId}`,
        "",
        "Restore: Settings page → バックアップから復元, or tell the AI to restore this folder.",
        "File: ledger-backup.json",
        "",
        JSON.stringify(meta.counts, null, 2),
      ].join("\n"),
      "utf8",
    );

    return NextResponse.json({
      ok: true,
      ...meta,
    });
  }

  return new NextResponse(JSON.stringify(backup, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="ledger-backup-${stamp}.json"`,
    },
  });
}
