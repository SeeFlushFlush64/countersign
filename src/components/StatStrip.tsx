export function StatStrip({
  stats,
}: {
  stats: { label: string; value: number; accent?: string }[];
}) {
  return (
    <div className="grid grid-cols-2 divide-x divide-panel-border border border-panel-border rounded-lg sm:grid-cols-4">
      {stats.map((stat) => (
        <div key={stat.label} className="px-5 py-4">
          <div
            className={`font-mono text-2xl ${stat.accent ?? "text-paper"}`}
          >
            {stat.value}
          </div>
          <div className="label-strip mt-1 text-slate">{stat.label}</div>
        </div>
      ))}
    </div>
  );
}
