"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { updatePassword } from "@/app/actions";

export default function ResetPasswordPage() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-8">
        <p className="font-display text-4xl tracking-tight text-accent-deep">TECHOox</p>
        <p className="mt-2 text-muted">新しいパスワードを設定してください。</p>
      </div>
      <form
        className="grid gap-4 rounded-2xl border border-line/80 bg-surface p-6"
        action={(fd) => {
          startTransition(async () => {
            const res = await updatePassword(fd);
            if (res?.error) setError(res.error);
          });
        }}
      >
        <h1 className="font-display text-xl">パスワード再設定</h1>
        <label className="grid gap-1 text-sm">
          <span className="text-muted">新しいパスワード（6文字以上）</span>
          <input
            name="password"
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            className="rounded-md border border-line bg-white px-3 py-2"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-muted">確認用パスワード</span>
          <input
            name="confirm"
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            className="rounded-md border border-line bg-white px-3 py-2"
          />
        </label>
        {error ? <p className="text-sm text-expense">{error}</p> : null}
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-accent px-4 py-2.5 text-white hover:bg-accent-deep disabled:opacity-60"
        >
          {pending ? "保存中…" : "パスワードを保存"}
        </button>
        <p className="text-center text-sm text-muted">
          <Link href="/login" className="text-accent underline-offset-2 hover:underline">
            ログインへ戻る
          </Link>
        </p>
      </form>
    </div>
  );
}
