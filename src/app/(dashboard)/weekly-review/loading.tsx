import { Skeleton } from "@/components/ui/skeleton";

export default function WeeklyReviewLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-72" />
      </div>

      <Skeleton className="h-40 rounded-xl" />
      <Skeleton className="h-24 rounded-xl" />
      <Skeleton className="h-32 rounded-xl" />
    </div>
  );
}
