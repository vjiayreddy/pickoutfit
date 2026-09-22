import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";

type StatTileProps = {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  tone?: "default" | "positive" | "negative";
  className?: string;
};

const TONES: Record<NonNullable<StatTileProps["tone"]>, string> = {
  default: "text-ink",
  positive: "text-[#007d48]",
  negative: "text-sale",
};

/** One number with its label. Flat soft-cloud tile — Nike chrome, not a card. */
export function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  className,
}: StatTileProps) {
  return (
    <div className={cn("bg-soft-cloud px-4 py-3", className)}>
      <div className="flex items-center gap-1.5 text-xs font-medium text-mute">
        {Icon ? <Icon className="size-3.5" aria-hidden /> : null}
        {label}
      </div>
      <div className={cn("mt-1 text-xl font-medium tracking-tight tabular-nums", TONES[tone])}>
        {value}
      </div>
      {hint ? <div className="mt-0.5 text-xs text-mute tabular-nums">{hint}</div> : null}
    </div>
  );
}

export function StatTileSkeleton() {
  return (
    <div className="space-y-2 bg-soft-cloud px-4 py-3">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-6 w-16" />
      <Skeleton className="h-3 w-24" />
    </div>
  );
}
