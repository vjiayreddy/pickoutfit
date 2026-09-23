import type { Metadata } from "next";
import { ChipRail } from "@/components/common/ChipRail";
import { PageHeader } from "@/components/common/PageHeader";
import { AppearanceSettings } from "@/components/settings/appearance-settings";
import { AvatarsSettings } from "@/components/settings/avatars-settings";
import { DangerZone } from "@/components/settings/danger-zone";
import { PreferencesForm } from "@/components/settings/preferences-form";

export const metadata: Metadata = {
  title: "Settings",
  description: "Your photos, styling preferences, theme and account data.",
};

const SECTIONS = [
  ["photos", "Fitting photos"],
  ["preferences", "Style preferences"],
  ["appearance", "Appearance"],
  ["data", "Your data"],
] as const;

export default function SettingsPage() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeader
        eyebrow="Your studio"
        title="Make it yours."
        description="Your fitting photos, styling preferences and personal space."
      />
      <nav
        aria-label="Settings sections"
        className="sticky top-[var(--app-header-height)] z-20 -mx-4 border-b border-hairline bg-canvas px-4 py-2 lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:px-0 lg:py-0"
      >
        <ChipRail>
          {SECTIONS.map(([id, label]) => (
            <a
              key={id}
              href={`#${id}`}
              className="inline-flex h-11 shrink-0 items-center rounded-full border border-hairline px-4 text-sm font-medium text-ink"
            >
              {label}
            </a>
          ))}
        </ChipRail>
      </nav>
      <div>
        <AvatarsSettings />
        <PreferencesForm />
        <AppearanceSettings />
        <DangerZone />
      </div>
    </div>
  );
}
