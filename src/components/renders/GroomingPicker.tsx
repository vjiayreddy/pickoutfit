"use client";

import {
  BEARD_LABELS,
  BEARD_STYLES,
  HAIR_LABELS,
  hairReference,
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
  /** Hairstyle studio: photo cards. The try-on sheet keeps text chips. */
  variant?: "chips" | "references";
  /** Photo shown on the "Keep current" card. */
  keepPreviewUrl?: string | null;
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
  variant = "chips",
  keepPreviewUrl,
}: GroomingPickerProps) {
  const showHair = mode !== "beard";
  const showBeard = mode !== "hairstyle" && presentation === "masculine";
  const hairOptions = hairStyles ?? hairStylesFor(presentation);
  const useReferences = variant === "references" && showHair;

  return (
    <div className="space-y-7">
      {showHair ? (
        <fieldset disabled={disabled} className="space-y-3">
          <legend className="text-[10px] font-medium tracking-wide text-mute uppercase">
            Hair
          </legend>
          {useReferences ? (
            <div className="grid grid-cols-2 gap-3 min-[480px]:grid-cols-3 xl:grid-cols-4">
              {hairOptions.map((option) => (
                <StyleCard
                  key={option}
                  active={hair === option}
                  label={HAIR_LABELS[option]}
                  src={option === "keep" ? keepPreviewUrl : hairReference(option)}
                  onClick={() => onHair(option)}
                />
              ))}
            </div>
          ) : (
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
          )}
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

function StyleCard({
  active,
  label,
  src,
  onClick,
}: {
  active: boolean;
  label: string;
  src?: string | null;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className="min-w-0 text-left">
      <div className={cn("aspect-square bg-soft-cloud", active && "ring-2 ring-ink ring-inset")}>
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className="h-full w-full object-cover" />
        ) : null}
      </div>
      <span
        className={cn(
          "mt-2 flex min-h-10 items-center justify-center rounded-full px-2 py-1 text-center text-xs font-medium leading-4",
          active ? "bg-ink text-canvas" : "text-ink",
        )}
      >
        {label}
      </span>
    </button>
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
