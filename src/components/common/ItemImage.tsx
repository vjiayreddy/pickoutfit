"use client";

import { cn } from "@/lib/cn";

type ItemImageProps = {
  src: string | null | undefined;
  alt: string;
  aspect?: string;
  className?: string;
  imgClassName?: string;
  priority?: boolean;
};

/** Flat product/photo stage on soft-cloud — Nike card language. */
export function ItemImage({
  src,
  alt,
  aspect = "aspect-square",
  className,
  imgClassName,
  priority,
}: ItemImageProps) {
  return (
    <div className={cn("relative overflow-hidden bg-soft-cloud", aspect, className)}>
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
