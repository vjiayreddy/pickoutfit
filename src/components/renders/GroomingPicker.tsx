"use client";

import {
  BEARD_LABELS,
  BEARD_STYLES,
  HAIR_LABELS,
  hairStylesFor,
  type BeardStyle,
  type HairStyle,
} from "@convex/shared/grooming";
import type { Presentation } from "@convex/shared/wardrobe";
import { cn } from "@/lib/cn";

type GroomingPickerProps = {
  presentation: Presentation;
  /** Sheet edits both. A service page edits one. */
  mode: "both" | "hairstyle" | "beard";
  hair: HairStyle;
  beard: BeardStyle;
  custom: string;
  onHair: (hair: HairStyle) => void;
  onBeard: (beard: BeardStyle) => void;
  onCustom: (custom: string) => void;
  disabled?: boolean;
  hairStyles?: readonly HairStyle[];
};

export function GroomingPicker({
  presentation,
  mode,
  hair,
  beard,
  custom,
  onHair,
  onBeard,
  onCustom,
  disabled,
  hairStyles,
}: GroomingPickerProps) {
  const showHair = mode !== "beard";
  const showBeard = mode !== "hairstyle" && presentation === "masculine";
  const hairOptions = hairStyles ?? hairStylesFor(presentation);

  return (
    <div className="space-y-7">
      {showHair ? (
        <fieldset disabled={disabled} className="space-y-3">
          <legend className="text-[10px] font-medium tracking-wide text-mute uppercase">
            Hair
          </legend>
          <div className="flex flex-wrap gap-2">
            {hairOptions.map((option) => (
              <Chip
                key={option}
                active={hair === option}
                label={HAIR_LABELS[option]}
                onClick={() => onHair(option)}
              />
            ))}
          </div>
        </fieldset>
      ) : null}

      {showBeard ? (
        <fieldset disabled={disabled} className="space-y-3">
          <legend className="text-[10px] font-medium tracking-wide text-mute uppercase">
            Beard
          </legend>
          <div className="flex flex-wrap gap-2">
            {BEARD_STYLES.map((option) => (
              <Chip
                key={option}
                active={beard === option}
                label={BEARD_LABELS[option]}
                onClick={() => onBeard(option)}
              />
            ))}
          </div>
        </fieldset>
      ) : null}

      <fieldset disabled={disabled} className="space-y-3">
        <legend className="text-[10px] font-medium tracking-wide text-mute uppercase">
          Custom note
        </legend>
        <textarea
          value={custom}
          onChange={(event) => onCustom(event.target.value)}
          rows={3}
          maxLength={200}
          placeholder="Optional — e.g. softer fringe, darker beard"
          className="w-full resize-none rounded-[24px] border border-hairline bg-soft-cloud px-4 py-3 text-sm outline-none focus:border-ink focus:bg-canvas"
        />
      </fieldset>
    </div>
  );
}

function Chip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "h-10 rounded-full px-4 text-sm font-medium",
        active ? "bg-ink text-canvas" : "border border-hairline bg-canvas text-ink",
      )}
    >
      {label}
    </button>
  );
}
