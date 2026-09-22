import { forwardRef } from "react";
import { cn } from "@/lib/cn";

export const Textarea = forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  function Textarea({ className, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(
          "w-full rounded-3xl border border-transparent bg-soft-cloud px-4 py-3 text-sm text-ink outline-none",
          "placeholder:text-mute focus:border-ink focus:bg-canvas focus:ring-2 focus:ring-soft-cloud",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      />
    );
  },
);
