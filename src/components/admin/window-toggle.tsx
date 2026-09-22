"use client";

import { cn } from "@/lib/cn";

export type AdminWindow = 1 | 7 | 30;

const WINDOWS = [1, 7, 30] as const satisfies readonly AdminWindow[];

const LABELS: Record<AdminWindow, string> = { 1: "Today", 7: "7 days", 30: "30 days" };

export function WindowToggle({
  value,
  onChange,
}: {
  value: AdminWindow;
  onChange: (next: AdminWindow) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Reporting window"
      className="inline-flex rounded-full bg-soft-cloud p-1"
    >
      {WINDOWS.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          aria-pressed={value === option}
          className={cn(
            "h-8 rounded-full px-4 text-sm font-medium transition",
            value === option ? "bg-ink text-canvas" : "text-ink hover:bg-canvas/60",
          )}
        >
          {LABELS[option]}
        </button>
      ))}
    </div>
  );
}
