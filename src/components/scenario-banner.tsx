import Link from "next/link";
import { getActiveScenario } from "@/lib/scenarios";

export async function ScenarioBanner() {
  const result = await getActiveScenario();
  if ("error" in result) return null;
  const scenario = result.scenario;
  if (!scenario || scenario.isMain) return null;

  return (
    <div className="border-b border-amber-300/80 bg-amber-50 text-amber-950">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
        <p>
          検証中: <span className="font-semibold">{scenario.name}</span>
          <span className="ml-2 text-amber-800/80">
            変更はこのシナリオに保存されます
          </span>
        </p>
        <Link
          href="/settings"
          className="shrink-0 text-xs font-medium underline underline-offset-2 hover:no-underline"
        >
          シナリオ設定
        </Link>
      </div>
    </div>
  );
}
