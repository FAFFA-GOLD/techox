"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { signIn } from "@/app/actions";
import { BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-8">
        <p className="font-display text-4xl tracking-tight text-accent-deep">
          {BRAND_NAME}
        </p>
        <p className="mt-2 text-muted">{BRAND_TAGLINE}</p>
      </div>
      <form
        className="grid gap-4 rounded-2xl border border-line/80 bg-surface p-6 shadow-[0_20px_50px_-30px_rgba(15,40,35,0.5)]"
        action={(fd) => {
          startTransition(async () => {
            const res = await signIn(fd);
            if (res?.error) setError(res.error);
          });
        }}
      >
        <h1 className="font-display text-xl">ログイン</h1>
        <label className="grid gap-1 text-sm">
          <span className="text-muted">メール</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className="rounded-md border border-line bg-white px-3 py-2"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-muted">パスワード</span>
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="rounded-md border border-line bg-white px-3 py-2"
          />
        </label>
        {error ? <p className="text-sm text-expense">{error}</p> : null}
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-accent px-4 py-2.5 text-white hover:bg-accent-deep disabled:opacity-60"
        >
          {pending ? "ログイン中…" : "ログイン"}
        </button>
        <p className="text-center text-sm text-muted">
          <Link
            href="/forgot-password"
            className="text-accent underline-offset-2 hover:underline"
          >
            パスワードを忘れた場合
          </Link>
        </p>
        <p className="text-center text-sm text-muted">
          初めての方は{" "}
          <Link href="/signup" className="text-accent underline-offset-2 hover:underline">
            アカウント作成
          </Link>
        </p>
      </form>
    </div>
  );
}
