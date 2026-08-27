"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { BRAND_NAME } from "@/lib/brand";

const links = [
  { href: "/dashboard", label: "全体家計" },
  { href: "/calendar", label: "毎日の支出" },
  { href: "/transactions", label: "明細" },
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
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-3 py-3">
        <Link
          href="/dashboard"
          className="shrink-0 text-lg font-bold tracking-tight text-accent-deep"
        >
          {BRAND_NAME}
        </Link>
        <nav className="flex flex-1 items-center justify-end gap-0.5 overflow-x-auto sm:justify-center">
          {links.map((link) => {
            const active = pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`whitespace-nowrap rounded-md px-2 py-1.5 text-xs transition sm:text-sm ${
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
        <button
          type="button"
          onClick={signOut}
          className="shrink-0 rounded-md border border-line px-2.5 py-1.5 text-xs text-muted hover:bg-white sm:text-sm"
        >
          退出
        </button>
      </div>
    </header>
  );
}
