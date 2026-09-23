import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type PageHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
  className?: string;
};

export function PageHeader({ title, description, actions, eyebrow, className }: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4",
        className,
      )}
    >
      <div className="min-w-0 space-y-2 sm:space-y-3">
        {eyebrow ? (
          <div className="font-mono text-[10px] font-medium tracking-[0.16em] text-mute uppercase">
            {eyebrow}
          </div>
        ) : null}
        <h1 className="text-2xl leading-tight font-medium tracking-[-0.04em] text-balance sm:text-[44px] sm:leading-[1.06] sm:tracking-[-0.055em]">
          {title}
        </h1>
        {description ? (
          <p className="max-w-xl text-sm leading-relaxed text-pretty text-mute">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
