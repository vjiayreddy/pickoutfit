import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type EmptyStateProps = {
  icon: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex min-h-[280px] flex-col items-center justify-center gap-4 border border-dashed border-hairline px-6 py-12 text-center",
        className,
      )}
    >
      <div className="flex size-12 items-center justify-center rounded-full bg-soft-cloud text-ink">
        <Icon className="size-5" aria-hidden />
      </div>
      <div className="space-y-2">
        <h2 className="text-lg font-medium tracking-tight">{title}</h2>
        {description ? <p className="max-w-sm text-sm text-mute">{description}</p> : null}
      </div>
      {action ? <div>{action}</div> : null}
    </div>
  );
}
