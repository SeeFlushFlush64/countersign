export function StatusStrip({
  segments,
}: {
  segments: React.ReactNode[];
}) {
  return (
    <div className="label-strip flex flex-wrap items-center gap-x-2.5 gap-y-1 text-slate">
      {segments.map((segment, i) => (
        <span key={i} className="inline-flex items-center gap-2.5">
          {i > 0 && <span className="text-slate-dim">&middot;</span>}
          {segment}
        </span>
      ))}
    </div>
  );
}
