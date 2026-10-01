export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-[22px] bg-sand ${className}`} />;
}

export function PageSkeleton() {
  return (
    <div role="status" aria-label="Cargando" className="space-y-6">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-10 w-2/3" />
      <div className="grid gap-4 sm:grid-cols-3">
        <Skeleton className="aspect-[3/4] rounded-[30px]" />
        <Skeleton className="aspect-[3/4] rounded-[30px]" />
        <Skeleton className="aspect-[3/4] rounded-[30px]" />
      </div>
    </div>
  );
}
