import { Skeleton } from "@/components/ui/skeleton";
import { StatTileSkeleton } from "./stat-tile";

export function StatTilesSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
      aria-busy="true"
      aria-label="Loading figures"
    >
      {Array.from({ length: count }, (_, index) => (
        <StatTileSkeleton key={index} />
      ))}
    </div>
  );
}

function TableBlockSkeleton({ rows }: { rows: number }) {
  return (
    <div className="border border-hairline">
      <div className="space-y-2 border-b border-hairline px-4 py-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-56" />
      </div>
      <div className="space-y-3 p-4">
        {Array.from({ length: rows }, (_, index) => (
          <Skeleton key={index} className="h-9 w-full rounded-none" />
        ))}
      </div>
    </div>
  );
}

/** Route-level skeleton: mirrors header → figures → spend cap → jobs → spenders → adjust. */
export function AdminSkeleton() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-8" aria-busy="true" aria-label="Loading admin">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-8 w-40 rounded-full" />
      </div>
      <StatTilesSkeleton count={3} />
      <StatTilesSkeleton count={4} />
      <StatTilesSkeleton count={6} />
      <Skeleton className="h-28 w-full rounded-none" />
      <TableBlockSkeleton rows={5} />
      <TableBlockSkeleton rows={4} />
    </div>
  );
}
