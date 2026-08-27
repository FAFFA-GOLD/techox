export default function Loading() {
  return (
    <div className="animate-pulse space-y-4 py-8">
      <div className="mx-auto h-8 w-48 rounded bg-line/60" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 rounded-xl bg-line/40" />
        ))}
      </div>
    </div>
  );
}
