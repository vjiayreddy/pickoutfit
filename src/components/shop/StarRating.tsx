"use client";

import { Star } from "lucide-react";
import { cn } from "@/lib/cn";

export function StarRatingDisplay({
  value,
  size = "sm",
  className,
}: {
  value: number;
  size?: "sm" | "md";
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(5, value));
  const iconClass = size === "md" ? "size-5" : "size-3.5";
  return (
    <span
      className={cn("inline-flex items-center gap-0.5", className)}
      aria-label={`${clamped} out of 5 stars`}
    >
      {Array.from({ length: 5 }, (_, index) => {
        const filled = index + 1 <= Math.round(clamped);
        return (
          <Star
            key={index}
            className={cn(
              iconClass,
              filled ? "fill-ink text-ink" : "fill-transparent text-hairline",
            )}
            aria-hidden
          />
        );
      })}
    </span>
  );
}

export function StarRatingInput({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (rating: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label="Rating">
      {Array.from({ length: 5 }, (_, index) => {
        const rating = index + 1;
        const selected = rating <= value;
        return (
          <button
            key={rating}
            type="button"
            role="radio"
            aria-checked={value === rating}
            aria-label={`${rating} star${rating === 1 ? "" : "s"}`}
            disabled={disabled}
            onClick={() => onChange(rating)}
            className="rounded-full p-1 transition disabled:opacity-50"
          >
            <Star
              className={cn(
                "size-7",
                selected ? "fill-ink text-ink" : "fill-transparent text-hairline",
              )}
              aria-hidden
            />
          </button>
        );
      })}
    </div>
  );
}
