export default function CalendarLoading() {
  return (
    <div className="grid gap-4">
      <div className="h-10 animate-pulse rounded-lg bg-white/70" />
      <div className="h-24 animate-pulse rounded-xl bg-white/70" />
      <div className="h-[28rem] animate-pulse rounded-xl bg-white/70" />
      <p className="text-center text-sm text-muted">読み込んでいます…</p>
    </div>
  );
}
