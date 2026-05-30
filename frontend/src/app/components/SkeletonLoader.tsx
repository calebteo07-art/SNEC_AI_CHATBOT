export function SkeletonLine({ widthClass = "w-full", heightClass = "h-4" }: { widthClass?: string; heightClass?: string }) {
  return <div className={`${widthClass} ${heightClass} rounded-lg bg-[#1F1A12]/8 animate-pulse`} />;
}

export function SkeletonCard({ rows = 3 }: { rows?: number }) {
  return (
    <div className="glass-card p-6 space-y-3">
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
        <div key={i} className="glass-card p-5 space-y-3">
          <SkeletonLine widthClass="w-1/2" heightClass="h-3" />
          <SkeletonLine widthClass="w-2/3" heightClass="h-8" />
        </div>
      ))}
    </div>
  );
}
