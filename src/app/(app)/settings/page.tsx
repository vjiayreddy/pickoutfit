import type { Metadata } from "next";
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
        className="flex flex-wrap gap-x-6 gap-y-2 text-xs font-medium"
      >
        {SECTIONS.map(([id, label]) => (
          <a
            key={id}
            href={`#${id}`}
            className="border-b border-transparent pb-2 text-mute transition-colors hover:border-ink hover:text-ink"
          >
            {label}
          </a>
        ))}
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
