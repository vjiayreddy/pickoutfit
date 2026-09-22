"use client";

import { useMutation, useQuery } from "convex/react";
import { ArrowRight, Check, Loader2, Star, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { PLANS, type PlanId } from "@convex/shared/credits";
import { ItemImage } from "@/components/common/ItemImage";
import { PhotoTips } from "@/components/onboarding/PhotoTips";
import {
  describeRejection,
  DropZone,
  type FileRejection,
} from "@/components/upload/DropZone";
import { useUpload } from "@/hooks/use-upload";
import { reportError } from "@/lib/client-errors";
import { pluralize } from "@/lib/format";

type AvatarStepProps = {
  plan: PlanId;
  onContinue: () => void;
};

function labelFromFile(file: File, index: number): string {
  const base = file.name.replace(/\.[^.]+$/, "").trim();
  return base.length > 0 && base.length <= 40 ? base : `Photo ${index + 1}`;
}

export function AvatarStep({ plan, onContinue }: AvatarStepProps) {
  const avatars = useQuery(api.avatars.list);
  const createAvatar = useMutation(api.avatars.create);
  const setDefault = useMutation(api.avatars.setDefault);
  const removeAvatar = useMutation(api.avatars.remove);
  const { upload, progress } = useUpload("avatars");

  const [pending, setPending] = useState<Array<{ key: string; name: string }>>(
    [],
  );
  const [error, setError] = useState<string | null>(null);
  const [settingDefault, setSettingDefault] = useState<Id<"avatars"> | null>(
    null,
  );

  const maxAvatars = PLANS[plan].maxAvatars;
  const count = avatars?.length ?? 0;
  const remaining = Math.max(0, maxAvatars - count - pending.length);
  const busy = pending.length > 0;

  async function handleDrop(accepted: File[], rejections: FileRejection[]) {
    for (const rejection of rejections) toast.error(describeRejection(rejection));
    if (accepted.length === 0) return;
    if (remaining === 0) {
      toast.error(
        `Your plan allows ${pluralize(maxAvatars, "photo")}. Remove one to add another.`,
      );
      return;
    }
    const files = accepted.slice(0, remaining);
    if (accepted.length > files.length) {
      toast.warning(
        `Only ${pluralize(files.length, "photo")} added — your plan allows ${pluralize(maxAvatars, "photo")}.`,
      );
    }

    const entries = files.map((file, index) => ({
      key: `${Date.now()}-${index}-${file.name}`,
      file,
      index,
    }));
    setPending(
      entries.map(({ key, file, index }) => ({
        key,
        name: labelFromFile(file, count + index),
      })),
    );
    setError(null);

    try {
      for (const { key, file, index } of entries) {
        const storageId = await upload(file, key);
        await createAvatar({
          storageId,
          label: labelFromFile(file, count + index),
        });
      }
      toast.success(
        files.length === 1 ? "Photo added." : `${files.length} photos added.`,
      );
    } catch (caught) {
      setError(reportError(caught).message);
    } finally {
      setPending([]);
    }
  }

  async function handleSetDefault(avatarId: Id<"avatars">) {
    setSettingDefault(avatarId);
    try {
      await setDefault({ avatarId });
    } catch (caught) {
      reportError(caught);
    } finally {
      setSettingDefault(null);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-12">
      <div className="space-y-4">
        <DropZone
          onDrop={handleDrop}
          multiple={maxAvatars > 1}
          maxFiles={Math.max(1, remaining)}
          disabled={busy || remaining === 0 || avatars === undefined}
          size="lg"
          title="A full-length photo of you"
          description="Keep your head and shoes in frame, with your arms relaxed by your sides."
          buttonLabel={busy ? "Uploading…" : "Choose a photo"}
          hint={
            remaining === 0
              ? `You have used all ${pluralize(maxAvatars, "photo")} on the ${PLANS[plan].name} plan.`
              : `${pluralize(count, "photo")} of ${maxAvatars} used · JPG, PNG or WebP`
          }
        />

        {pending.length > 0 ? (
          <ul className="space-y-2" aria-live="polite">
            {pending.map((entry) => {
              const value = Math.round((progress[entry.key] ?? 0) * 100);
              return (
                <li key={entry.key} className="space-y-1.5 border border-hairline p-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                    <span className="text-xs text-mute tabular-nums">{value}%</span>
                  </div>
                  <div className="h-1 bg-soft-cloud">
                    <div
                      className="h-full bg-ink transition-all"
                      style={{ width: `${value}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}

        {error ? (
          <p className="text-sm text-sale" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <div className="min-w-0 space-y-5">
        {avatars === undefined ? (
          <div className="grid grid-cols-2 gap-5">
            <div className="aspect-[2/3] animate-pulse bg-soft-cloud" />
            <div className="aspect-[2/3] animate-pulse bg-soft-cloud" />
          </div>
        ) : avatars.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">Your photos</p>
            <ul className="grid grid-cols-2 gap-5">
              {avatars.map((avatar) => (
                <li key={avatar._id} className="space-y-2">
                  <div className="relative">
                    <ItemImage
                      src={avatar.url}
                      alt={avatar.label}
                      aspect="aspect-[2/3]"
                      imgClassName="object-contain"
                    />
                    {avatar.isDefault ? (
                      <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-canvas px-2 py-1 text-[11px] font-medium">
                        <Check className="size-3" aria-hidden />
                        Default
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {avatar.label}
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove ${avatar.label}`}
                      className="flex size-9 items-center justify-center rounded-full text-mute hover:bg-soft-cloud hover:text-ink"
                      onClick={async () => {
                        if (!confirm("Remove this photo?")) return;
                        try {
                          await removeAvatar({ avatarId: avatar._id });
                        } catch (caught) {
                          toast.error(reportError(caught).message);
                        }
                      }}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  {!avatar.isDefault ? (
                    <button
                      type="button"
                      className="flex h-10 w-full items-center justify-center gap-2 rounded-full border border-hairline text-sm font-medium"
                      onClick={() => handleSetDefault(avatar._id)}
                      disabled={settingDefault !== null}
                    >
                      {settingDefault === avatar._id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Star className="size-4" />
                      )}
                      Make default
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <PhotoTips />
        )}
      </div>

      <div className="flex items-center justify-between gap-4 border-t border-hairline pt-5 lg:col-span-2">
        <p className="text-xs text-mute">
          {count > 0
            ? "Photo added. Next, choose your styling preferences."
            : "Add a photo to continue."}
        </p>
        <button
          type="button"
          className="inline-flex h-12 items-center gap-2 rounded-full bg-ink px-8 text-base font-medium text-canvas transition active:scale-95 active:opacity-50 disabled:opacity-50"
          onClick={onContinue}
          disabled={count === 0 || busy}
        >
          Continue
          <ArrowRight className="size-4" />
        </button>
      </div>
    </div>
  );
}
