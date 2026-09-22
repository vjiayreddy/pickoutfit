import { forwardRef } from "react";
import { cn } from "@/lib/cn";

export const Input = forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  function Input({ className, type = "text", ...props }, ref) {
    return (
      <input
        ref={ref}
        type={type}
        className={cn(
          "h-12 w-full rounded-full border border-transparent bg-soft-cloud px-4 text-sm text-ink outline-none",
          "placeholder:text-mute focus:border-ink focus:bg-canvas focus:ring-2 focus:ring-soft-cloud",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      />
    );
  },
);
