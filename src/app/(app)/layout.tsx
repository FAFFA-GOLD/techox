export const dynamic = "force-dynamic";

import { AppNav } from "@/components/app-nav";
import { ScenarioBanner } from "@/components/scenario-banner";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <AppNav />
      <ScenarioBanner />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-16">{children}</main>
    </div>
  );
}
