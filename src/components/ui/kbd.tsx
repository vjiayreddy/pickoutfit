import { cn } from "@/lib/cn";

export function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-hairline bg-soft-cloud px-1.5 py-0.5 font-mono text-[10px] font-medium text-ink",
        className,
      )}
      {...props}
    />
  );
}
