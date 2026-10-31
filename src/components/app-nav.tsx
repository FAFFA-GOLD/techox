"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { BRAND_NAME } from "@/lib/brand";

const links = [
  { href: "/calendar", label: "デイリーボード" },
  { href: "/schedules", label: "取引登録" },
  { href: "/forecast", label: "キャッシュフロー" },
  { href: "/settings", label: "設定" },
];

export function AppNav() {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-white/70 backdrop-blur-md">
      <div className="mx-auto grid max-w-6xl gap-1.5 px-2 py-2 sm:px-3 sm:py-3">
        <div className="flex items-center justify-between gap-2">
          <Link
            href="/calendar"
            className="text-base font-bold tracking-tight text-accent-deep sm:text-lg"
          >
            {BRAND_NAME}
          </Link>
          <button
            type="button"
            onClick={signOut}
            className="rounded-md border border-line px-2.5 py-1.5 text-xs text-muted hover:bg-white sm:text-sm"
          >
            退出
          </button>
        </div>
        <nav className="flex flex-wrap gap-1">
          {links.map((link) => {
            const active = pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-md px-2.5 py-1.5 text-xs transition sm:text-sm ${
                  active
                    ? "bg-accent text-white"
                    : "text-muted hover:bg-white hover:text-ink"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
