import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const TONE_TEXT: Record<string, string> = {
  default: "",
  warning: "text-warning",
  success: "text-success",
  info: "text-info",
  muted: "text-muted-foreground",
};

const TONE_TILE: Record<string, string> = {
  default: "bg-primary/10 text-primary",
  warning: "bg-warning/10 text-warning",
  success: "bg-success/10 text-success",
  info: "bg-info/10 text-info",
  muted: "bg-muted text-muted-foreground",
};

export function StatCard({
  icon: Icon,
  label,
  value,
  sublabel,
  tone = "default",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sublabel?: string;
  tone?: "default" | "warning" | "success" | "info" | "muted";
}) {
  return (
    <Card className="gap-0 py-0">
      <CardContent className="flex items-start justify-between gap-3 p-4">
        <div className="flex flex-col gap-1">
          <p className="text-muted-foreground text-xs font-medium">{label}</p>
          <p className={cn("text-2xl font-semibold tracking-tight", TONE_TEXT[tone])}>{value}</p>
          {sublabel ? <p className="text-muted-foreground text-xs">{sublabel}</p> : null}
        </div>
        <div className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", TONE_TILE[tone])}>
          <Icon className="size-4" />
        </div>
      </CardContent>
    </Card>
  );
}
