// Tiny server-rendered charts — no client JS, no chart library. Bars are
// plain divs scaled against the max value.

export type DailyPoint = { day: string; count: number };

export function DailyBarChart({
  data,
  emptyLabel = "No requests yet.",
}: {
  data: DailyPoint[];
  emptyLabel?: string;
}) {
  if (data.length === 0) {
    return <p className="text-sm text-gray-500">{emptyLabel}</p>;
  }

  const max = Math.max(1, ...data.map((d) => d.count));

  return (
    <div>
      <div className="flex h-32 items-end gap-1">
        {data.map((point) => (
          <div
            key={point.day}
            title={`${point.day}: ${point.count} request${point.count === 1 ? "" : "s"}`}
            className="group relative flex-1"
          >
            <div
              className="w-full rounded-t bg-blue-500 group-hover:bg-blue-600"
              style={{ height: `${Math.max(3, Math.round((point.count / max) * 100))}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1 text-[10px] text-gray-400">
        {data
          .filter((_, i) => i % 3 === 0 || i === data.length - 1)
          .map((point) => (
            <span key={point.day} className="flex-1 truncate text-center">
              {point.day.slice(5)}
            </span>
          ))}
      </div>
    </div>
  );
}

export function ErrorRateRow({
  vendor,
  slug,
  total,
  errors,
}: {
  vendor: string;
  slug: string;
  total: number;
  errors: number;
}) {
  const rate = total === 0 ? 0 : Math.round((errors / total) * 100);
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{vendor}</p>
        <p className="text-xs text-gray-500">
          <code>/api/v1/{slug}</code> · {total} request{total === 1 ? "" : "s"}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <div className="h-2 w-24 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
          <div
            className={`h-full rounded-full ${rate > 10 ? "bg-red-500" : rate > 0 ? "bg-amber-500" : "bg-green-500"}`}
            style={{ width: `${rate}%` }}
          />
        </div>
        <span
          className={`w-10 text-right text-sm font-semibold ${
            rate > 10 ? "text-red-600" : rate > 0 ? "text-amber-600" : "text-green-600"
          }`}
        >
          {rate}%
        </span>
      </div>
    </div>
  );
}

export function TopCustomerRow({
  email,
  count,
  rank,
}: {
  email: string;
  count: number;
  rank: number;
}) {
  return (
    <div className="flex items-center gap-3 py-2">
      <span className="w-6 text-sm text-gray-400">#{rank}</span>
      <span className="min-w-0 flex-1 truncate text-sm">{email}</span>
      <span className="text-sm font-semibold">
        {count} <span className="text-xs font-normal text-gray-500">req</span>
      </span>
    </div>
  );
}
