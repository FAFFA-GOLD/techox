"use client";

export default function CalendarError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <section className="rounded-xl border border-line/80 bg-surface p-4">
      <h1 className="text-lg font-bold">毎日の支出を表示できませんでした</h1>
      <p className="mt-2 text-sm text-muted">
        {error.message || "読み込みに失敗しました。もう一度開いてください。"}
      </p>
      <button
        type="button"
        onClick={() => unstable_retry()}
        className="mt-4 rounded-md bg-accent px-3 py-2 text-sm text-white"
      >
        再読み込み
      </button>
    </section>
  );
}
