"use client";

import { useMutation, useQuery } from "convex/react";
import { Loader2, RefreshCw, Star, Trash2, UploadCloud } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { PLANS } from "@convex/shared/credits";
import {
  ACCEPTED_IMAGE_TYPES,
  MAX_UPLOAD_BYTES,
} from "@convex/shared/wardrobe";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { ErrorAlert } from "@/components/common/ErrorAlert";
import { ItemImage } from "@/components/common/ItemImage";
import { Button } from "@/components/ui/button";
import { useUpload } from "@/hooks/use-upload";
import { reportError, toClientError } from "@/lib/client-errors";
import { cn } from "@/lib/cn";
import { formatBytes, formatPercent, pluralize } from "@/lib/format";
import { routes } from "@/lib/routes";

const ACCEPT = Object.entries(ACCEPTED_IMAGE_TYPES)
  .flatMap(([mime, extensions]) => [mime, ...extensions])
  .join(",");

const AVATAR_UPLOAD_KEY = "avatar";

function labelFromFileName(fileName: string): string {
  return fileName
    .replace(/\.[^.]+$/, "")
    .slice(0, 40)
    .trim();
}

export function AvatarsSettings() {
  const me = useQuery(api.users.me);
  const avatars = useQuery(api.avatars.list);
  const { upload, progress: uploadProgress, isUploading } = useUpload("avatars");
  const createAvatar = useMutation(api.avatars.create);
  const replaceAvatar = useMutation(api.avatars.replace);
  const setDefault = useMutation(api.avatars.setDefault);
  const removeAvatar = useMutation(api.avatars.remove);

  const inputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [replacementId, setReplacementId] = useState<Id<"avatars"> | null>(null);
  const [saving, setSaving] = useState(false);
  const [pendingDefaultId, setPendingDefaultId] = useState<Id<"avatars"> | null>(null);

  const plan = me ? PLANS[me.balance.plan] : null;
  const atLimit =
    plan !== null && avatars !== undefined && avatars.length >= plan.maxAvatars;
  const lastAvatarLocked =
    Boolean(me?.onboardedAt) && avatars !== undefined && avatars.length === 1;
  const uploading = isUploading || saving;
  const progress = uploading ? (uploadProgress[AVATAR_UPLOAD_KEY] ?? 0) : null;

  async function handleFile(file: File | undefined, replaceId = replacementId) {
    if (!file || uploading) return;
    if (!(file.type in ACCEPTED_IMAGE_TYPES)) {
      toast.error("That file type is not supported. Use a JPEG, PNG or WebP photo.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error(`Photos must be under ${formatBytes(MAX_UPLOAD_BYTES)}.`);
      return;
    }
    setUploadError(null);
    setSaving(true);
    try {
      const storageId = await upload(file, AVATAR_UPLOAD_KEY);
      const label = labelFromFileName(file.name);
      if (replaceId) {
        await replaceAvatar({
          avatarId: replaceId,
          storageId,
          ...(label ? { label } : {}),
        });
      } else {
        await createAvatar(label ? { storageId, label } : { storageId });
      }
      toast.success(replaceId ? "Photo replaced." : "Photo added.");
    } catch (error) {
      setUploadError(toClientError(error).message);
      reportError(error, "Could not add that photo.");
    } finally {
      setSaving(false);
      setReplacementId(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleSetDefault(avatarId: Id<"avatars">) {
    setPendingDefaultId(avatarId);
    try {
      await setDefault({ avatarId });
    } catch (error) {
      reportError(error, "Could not change the default photo.");
    } finally {
      setPendingDefaultId(null);
    }
  }

  return (
    <section
      id="photos"
      className="grid scroll-mt-24 gap-6 border-t border-hairline py-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-10"
    >
      <header className="space-y-2">
        <p className="font-mono text-[10px] tracking-[0.16em] text-mute uppercase">
          01 / Fitting room
        </p>
        <h2 className="text-xl font-medium tracking-tight">Photos of you</h2>
        <p className="text-sm leading-relaxed text-mute">
          The starting point for every try-on. Use a clear, full-length photo with a simple
          background.
          {plan && avatars ? (
            <span className="mt-3 block text-xs tabular-nums">
              {avatars.length} of {plan.maxAvatars} used on {plan.name}.
            </span>
          ) : null}
        </p>
      </header>

      <div className="min-w-0 space-y-5">
        <input
          ref={inputRef}
          id="avatar-file"
          type="file"
          accept={ACCEPT}
          className="sr-only"
          disabled={uploading}
          onChange={(event) => void handleFile(event.target.files?.[0])}
        />
        {uploadError ? (
          <ErrorAlert
            title="That photo did not upload"
            message={uploadError}
            onRetry={() => inputRef.current?.click()}
            retryLabel="Pick another photo"
          />
        ) : null}

        {avatars === undefined ? (
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-3" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="aspect-[2/3] animate-pulse bg-soft-cloud" />
            ))}
          </div>
        ) : avatars.length === 0 ? (
          <div className="border-b border-hairline pb-4">
            <h3 className="text-sm font-medium">Add your first fitting photo</h3>
            <p className="mt-1 text-sm text-mute">
              Your uploaded photo will appear here. You can replace it at any time.
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-5 sm:grid-cols-3">
            {avatars.map((avatar) => (
              <li key={avatar._id} className="space-y-2">
                <div className="relative">
                  <ItemImage
                    src={avatar.url}
                    alt={avatar.label}
                    variant="photo"
                    aspect="aspect-[2/3]"
                    imgClassName="object-contain"
                  />
                  {avatar.isDefault ? (
                    <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-canvas px-2 py-1 text-[11px] font-medium">
                      <Star className="size-3 fill-current" aria-hidden />
                      Default
                    </span>
                  ) : null}
                </div>
                <p className="truncate text-sm font-medium" title={avatar.label}>
                  {avatar.label}
                </p>
                <Button
                  variant="outline"
                  size="xs"
                  className="w-full"
                  disabled={uploading}
                  onClick={() => {
                    setReplacementId(avatar._id);
                    inputRef.current?.click();
                  }}
                >
                  <RefreshCw aria-hidden />
                  Replace photo
                </Button>
                <div className="flex items-center gap-1">
                  {avatar.isDefault ? (
                    <span className="flex-1 text-xs text-mute">Used by default</span>
                  ) : (
                    <Button
                      variant="outline"
                      size="xs"
                      className="flex-1"
                      disabled={pendingDefaultId !== null}
                      onClick={() => void handleSetDefault(avatar._id)}
                    >
                      {pendingDefaultId === avatar._id ? (
                        <Loader2 className="animate-spin" aria-hidden />
                      ) : null}
                      Make default
                    </Button>
                  )}
                  {lastAvatarLocked ? (
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      disabled
                      title="Replace this photo to keep an avatar available"
                      aria-label={`Remove ${avatar.label}`}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  ) : (
                    <ConfirmDialog
                      destructive
                      title="Remove this photo?"
                      description="Renders you have already made keep working. The photo itself is deleted for good."
                      confirmLabel="Remove"
                      onConfirm={() => removeAvatar({ avatarId: avatar._id })}
                      trigger={
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Remove ${avatar.label}`}
                        >
                          <Trash2 aria-hidden />
                        </Button>
                      }
                    />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {atLimit && plan ? (
          <p className="border-t border-hairline pt-4 text-xs leading-relaxed text-mute">
            All {pluralize(plan.maxAvatars, "photo")} on the {plan.name} plan are in use. Replace a
            photo above, or{" "}
            <Link
              href={routes.billing}
              className="underline underline-offset-2 hover:text-ink"
            >
              move to a bigger plan
            </Link>
            .
          </p>
        ) : (
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              setReplacementId(null);
              void handleFile(event.dataTransfer.files[0], null);
            }}
            className={cn(
              "flex flex-col items-center justify-center gap-2 border border-dashed border-hairline bg-soft-cloud/50 px-4 py-5 text-center transition-colors",
              dragging ? "border-ink bg-soft-cloud" : "hover:bg-soft-cloud",
              uploading && "pointer-events-none opacity-60",
            )}
          >
            <UploadCloud className="size-5 text-mute" aria-hidden />
            <span className="text-sm font-medium">Drop a fitting photo here</span>
            <Button
              size="sm"
              disabled={uploading}
              onClick={() => {
                setReplacementId(null);
                inputRef.current?.click();
              }}
            >
              {uploading ? "Uploading…" : "Select photo"}
            </Button>
            <span className="text-xs text-mute">
              JPEG, PNG or WebP · up to {formatBytes(MAX_UPLOAD_BYTES)}
            </span>
          </div>
        )}

        {progress !== null ? (
          <div className="space-y-1.5" aria-live="polite">
            <div className="flex items-center justify-between text-xs text-mute">
              <span>Uploading photo…</span>
              <span className="tabular-nums">{formatPercent(progress)}</span>
            </div>
            <div className="h-1 bg-soft-cloud">
              <div
                className="h-full bg-ink transition-all"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
