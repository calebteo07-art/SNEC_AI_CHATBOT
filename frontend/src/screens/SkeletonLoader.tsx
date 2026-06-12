export function SkeletonLine({ widthClass = "w-full", heightClass = "h-4" }: { widthClass?: string; heightClass?: string }) {
  return <div className={`${widthClass} ${heightClass} rounded-lg skeleton`} />;
}

export function SkeletonCard({ rows = 3 }: { rows?: number }) {
  return (
    <div className="glass-card" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 10 }}>
      <SkeletonLine widthClass="w-1/3" heightClass="h-3" />
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonLine key={i} widthClass={i % 2 === 0 ? "w-full" : "w-4/5"} />
      ))}
    </div>
  );
}

export function SkeletonStatStrip() {
  return (
    <div className="grid grid-cols-3 gap-4 mt-12">
      {[0, 1, 2].map((i) => (
        <div key={i} className="glass-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 10 }}>
          <SkeletonLine widthClass="w-1/2" heightClass="h-3" />
          <SkeletonLine widthClass="w-2/3" heightClass="h-8" />
        </div>
      ))}
    </div>
  );
}
