import { cn } from "@/lib/cn";

export function Alert({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"div"> & { variant?: "default" | "destructive" }) {
  return (
    <div
      role="alert"
      className={cn(
        "relative grid w-full grid-cols-[auto_1fr] items-start gap-3 border border-hairline bg-canvas p-4 text-sm text-ink",
        variant === "destructive" && "border-sale/40 text-sale",
        className,
      )}
      {...props}
    />
  );
}

export function AlertTitle({ className, ...props }: React.ComponentProps<"h5">) {
  return <h5 className={cn("col-start-2 font-medium tracking-tight", className)} {...props} />;
}

export function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div className={cn("col-start-2 text-sm text-mute [&_p]:leading-relaxed", className)} {...props} />
  );
}
