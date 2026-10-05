import * as React from "react";
import { cn } from "@/lib/cn";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-20 w-full rounded-3xl border border-transparent bg-muted px-4 py-2.5 text-sm text-foreground transition-colors outline-none",
        "placeholder:text-muted-foreground",
        "focus-visible:border-foreground focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-muted",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
