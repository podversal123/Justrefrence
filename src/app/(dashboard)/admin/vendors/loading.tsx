import { Skeleton } from "@/components/ui/skeleton";

export default function VendorsLoading() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-36" />
      </div>
      <div className="flex gap-3">
        <Skeleton className="h-9 max-w-xs flex-1" />
        <Skeleton className="h-9 w-44" />
        <Skeleton className="h-9 w-48" />
      </div>
      <div className="space-y-2 rounded-lg border p-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    </div>
  );
}
