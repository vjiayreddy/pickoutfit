"use client";

import Link from "next/link";
import {
  cloneElement,
  isValidElement,
  type ButtonHTMLAttributes,
  type ReactElement,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";

type Variant = "default" | "primary" | "outline" | "secondary" | "ghost" | "destructive" | "link";
type Size = "default" | "xs" | "sm" | "lg" | "icon" | "icon-xs" | "icon-sm" | "icon-lg";

const variantClass: Record<Variant, string> = {
  default: "bg-ink text-canvas hover:bg-ink/90",
  primary: "bg-ink text-canvas hover:bg-ink/90",
  outline: "border border-hairline bg-canvas text-ink hover:bg-soft-cloud",
  secondary: "bg-soft-cloud text-ink hover:bg-hairline/40",
  ghost: "bg-transparent text-ink hover:bg-soft-cloud",
  destructive: "bg-sale/10 text-sale hover:bg-sale/20",
  link: "bg-transparent text-ink underline underline-offset-4",
};

const sizeClass: Record<Size, string> = {
  default: "h-12 px-8 text-sm",
  xs: "h-7 px-3 text-xs",
  sm: "h-10 px-4 text-sm",
  lg: "h-12 px-8 text-base",
  icon: "size-10 p-0",
  "icon-xs": "size-7 p-0",
  "icon-sm": "size-8 p-0",
  "icon-lg": "size-12 p-0",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  href?: string;
  /** When false with `render`, clone the element instead of a native button (Fitcheck/base-ui compat). */
  nativeButton?: boolean;
  render?: ReactElement<{ className?: string; children?: ReactNode }>;
  asChild?: boolean;
};

export function Button({
  className,
  variant = "default",
  size = "default",
  href,
  nativeButton = true,
  render,
  asChild,
  children,
  type = "button",
  disabled,
  ...props
}: ButtonProps) {
  const classes = cn(
    "inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-full font-medium transition active:scale-95 active:opacity-50 disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
    variantClass[variant],
    sizeClass[size],
    className,
  );

  if (href) {
    const isExternal = href.startsWith("http://") || href.startsWith("https://") || href.startsWith("blob:");
    if (isExternal) {
      return (
        <a href={href} className={classes} aria-disabled={disabled || undefined} download target="_blank" rel="noreferrer">
          {children}
        </a>
      );
    }
    return (
      <Link href={href} className={classes} aria-disabled={disabled || undefined}>
        {children}
      </Link>
    );
  }

  if ((asChild || nativeButton === false) && render && isValidElement(render)) {
    return cloneElement(render, {
      className: cn(classes, render.props.className),
      children: children ?? render.props.children,
    });
  }

  return (
    <button type={type} className={classes} disabled={disabled} {...props}>
      {children}
    </button>
  );
}
