import { SettingsForm } from "@/components/settings-form";
import { BackupPanel } from "@/components/backup-panel";
import { ScenarioPanel } from "@/components/scenario-panel";
import { fetchSettings } from "@/lib/data";
import { listScenarios } from "@/lib/scenarios";
import { readdir, readFile } from "fs/promises";
import path from "path";

async function listLocalBackups() {
  const root = path.join(process.cwd(), "backups");
  try {
    const names = (await readdir(root)).sort().reverse();
    const out: {
      name: string;
      exportedAt?: string;
      counts?: Record<string, number>;
    }[] = [];
    for (const name of names) {
      try {
        const raw = await readFile(
          path.join(root, name, "ledger-backup.json"),
          "utf8",
        );
        const json = JSON.parse(raw) as {
          exportedAt?: string;
          transactions?: unknown[];
          categories?: unknown[];
          recurringRules?: unknown[];
          dailySpendEntries?: unknown[];
        };
        out.push({
          name,
          exportedAt: json.exportedAt,
          counts: {
            transactions: json.transactions?.length ?? 0,
            categories: json.categories?.length ?? 0,
            recurringRules: json.recurringRules?.length ?? 0,
            dailySpendEntries: json.dailySpendEntries?.length ?? 0,
          },
        });
      } catch {
        // skip incomplete dirs
      }
    }
    return out;
  } catch {
    return [];
  }
}

export default async function SettingsPage() {
  const [settings, backups, scenarioResult] = await Promise.all([
    fetchSettings(),
    listLocalBackups(),
    listScenarios(),
  ]);

  const scenarios =
    "ok" in scenarioResult && scenarioResult.ok
      ? scenarioResult.scenarios
      : [];
  const scenarioError =
    "error" in scenarioResult ? scenarioResult.error : null;

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">設定</h1>
        <p className="mt-1 text-sm text-muted">
          給料サイクルの起点を設定します。全体家計・キャッシュフローはこの設定に従います。
        </p>
      </div>
      <SettingsForm settings={settings} />
      {scenarioError ? (
        <section className="max-w-lg rounded-xl border border-line/80 bg-surface p-5">
          <h2 className="text-lg font-bold">検証シナリオ</h2>
          <p className="mt-2 text-sm text-expense">{scenarioError}</p>
        </section>
      ) : (
        <ScenarioPanel scenarios={scenarios} />
      )}
      <BackupPanel backups={backups} />
    </div>
  );
}
