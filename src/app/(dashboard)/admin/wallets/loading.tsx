import { Skeleton } from "@/components/ui/skeleton";

export default function WalletsLoading() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="flex gap-3">
        <Skeleton className="h-9 max-w-sm flex-1" />
        <Skeleton className="h-9 w-20" />
      </div>
      <Skeleton className="h-24 w-full" />
    </div>
  );
}
