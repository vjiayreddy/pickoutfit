"use client";

import { cn } from "@/lib/cn";

type ItemImageProps = {
  src: string | null | undefined;
  alt: string;
  /** cutout/photo default square; render uses portrait crop. */
  variant?: "cutout" | "photo" | "render";
  aspect?: string;
  className?: string;
  imgClassName?: string;
  priority?: boolean;
};

/** Flat product/photo stage on soft-cloud — Nike card language. */
export function ItemImage({
  src,
  alt,
  variant = "cutout",
  aspect,
  className,
  imgClassName,
  priority,
}: ItemImageProps) {
  const ratio =
    aspect ?? (variant === "render" ? "aspect-[2/3]" : "aspect-square");
  return (
    <div className={cn("relative overflow-hidden bg-soft-cloud", ratio, className)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- Convex storage URLs; no next/image remote config yet
        <img
          src={src}
          alt={alt}
          className={cn("h-full w-full object-contain", imgClassName)}
          loading={priority ? "eager" : "lazy"}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-xs text-mute">
          No image
        </div>
      )}
    </div>
  );
}
