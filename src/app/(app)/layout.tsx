export const dynamic = "force-dynamic";

import { AppNav } from "@/components/app-nav";
import { ScenarioBanner } from "@/components/scenario-banner";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <AppNav />
      <ScenarioBanner />
      <main className="mx-auto w-full min-w-0 max-w-6xl flex-1 px-3 py-4 pb-20 sm:px-4 sm:py-6">{children}</main>
    </div>
  );
}
