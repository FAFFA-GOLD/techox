"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState, useTransition } from "react";
import { requestPasswordReset } from "@/app/actions";

function ForgotPasswordForm() {
  const searchParams = useSearchParams();
  const expired = searchParams.get("error") === "expired";
  const [error, setError] = useState<string | null>(
    expired
      ? "リセット用リンクの有効期限が切れているか、無効です。もう一度メールを送信してください。"
      : null,
  );
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-8">
        <p className="font-display text-4xl tracking-tight text-accent-deep">TECHOox</p>
        <p className="mt-2 text-muted">登録メールにパスワード再設定リンクを送ります。</p>
      </div>
      {sent ? (
        <div className="grid gap-4 rounded-2xl border border-line/80 bg-surface p-6">
          <h1 className="font-display text-xl">メールを送信しました</h1>
          <p className="text-sm text-muted">
            届いたメールの「Reset password」を開き、新しいパスワードを設定してください。
            数分待っても届かない場合は迷惑メールも確認してください。
          </p>
          <Link
            href="/login"
            className="rounded-md bg-accent px-4 py-2.5 text-center text-white hover:bg-accent-deep"
          >
            ログインへ戻る
          </Link>
        </div>
      ) : (
        <form
          className="grid gap-4 rounded-2xl border border-line/80 bg-surface p-6"
          action={(fd) => {
            startTransition(async () => {
              const res = await requestPasswordReset(fd);
              if (res?.error) {
                setError(res.error);
                return;
              }
              setError(null);
              setSent(true);
            });
          }}
        >
          <h1 className="font-display text-xl">パスワードを忘れた場合</h1>
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
          {error ? <p className="text-sm text-expense">{error}</p> : null}
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-accent px-4 py-2.5 text-white hover:bg-accent-deep disabled:opacity-60"
          >
            {pending ? "送信中…" : "再設定メールを送る"}
          </button>
          <p className="text-center text-sm text-muted">
            <Link href="/login" className="text-accent underline-offset-2 hover:underline">
              ログインへ戻る
            </Link>
          </p>
        </form>
      )}
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex min-h-dvh w-full max-w-md items-center justify-center px-4 text-muted">
          読み込み中…
        </div>
      }
    >
      <ForgotPasswordForm />
    </Suspense>
  );
}
