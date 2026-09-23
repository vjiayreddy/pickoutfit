import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type StickyActionProps = {
  children: ReactNode;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  /** `screen` sits on the home indicator. `tab` sits above the bottom tab bar. */
  placement?: "tab" | "screen";
};

export function StickyAction({
  children,
  href,
  onClick,
  disabled,
  className,
  placement = "tab",
}: StickyActionProps) {
  const bottom =
    placement === "tab"
      ? "calc(var(--app-tab-height) + 0.75rem)"
      : "max(0.75rem, env(safe-area-inset-bottom))";
  const classes = cn(
    "inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-ink px-6 text-base font-medium text-canvas transition active:scale-95 active:opacity-50 disabled:opacity-50",
    className,
  );

  return (
    <>
      <div className="h-16 lg:hidden" aria-hidden />
      <div
        className="fixed inset-x-0 z-20 px-4 lg:hidden"
        style={{ bottom }}
      >
        {href ? (
          <Link href={href} className={classes}>
            {children}
          </Link>
        ) : (
          <button type="button" onClick={onClick} disabled={disabled} className={classes}>
            {children}
          </button>
        )}
      </div>
    </>
  );
}
