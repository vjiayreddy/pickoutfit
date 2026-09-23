"use client";

import { Sun } from "lucide-react";

/**
 * WardrobeAI ships Nike light chrome only — no dark/system toggle.
 * Kept as a settings section so the page structure matches Fitcheck.
 */
export function AppearanceSettings() {
  return (
    <section
      id="appearance"
      className="grid scroll-mt-40 gap-6 border-t border-hairline py-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-10"
    >
      <header className="space-y-2">
        <p className="font-mono text-[10px] tracking-[0.16em] text-mute uppercase">
          03 / The studio
        </p>
        <h2 className="text-xl font-medium tracking-tight">Appearance</h2>
        <p className="text-sm text-mute">Applies to this browser only.</p>
      </header>
      <div className="min-w-0">
        <div
          className="flex items-start gap-3 border border-hairline bg-soft-cloud px-4 py-5"
          role="group"
          aria-label="Theme"
        >
          <Sun className="mt-0.5 size-4 shrink-0 text-mute" aria-hidden />
          <div className="space-y-1">
            <p className="text-sm font-medium">Light</p>
            <p className="text-sm text-mute">
              The studio uses a fixed light palette — ink on soft cloud. Dark mode is not offered.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
