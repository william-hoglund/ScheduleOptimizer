import { Skeleton } from "@/components/ui/skeleton";

export default function DeadlinesLoading() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-9 w-32 rounded-md" />
      </div>

      <div className="space-y-4">
        {Array.from({ length: 3 }, (_, group) => (
          <div key={group} className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-16 rounded-lg" />
            <Skeleton className="h-16 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}
