"use client";

import { useMutation } from "convex/react";
import { X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  MAX_REVIEW_BODY,
  MAX_REVIEW_IMAGES,
  MAX_REVIEW_TITLE,
  MIN_REVIEW_BODY,
} from "@convex/shared/reviews";
import { StarRatingInput } from "@/components/shop/StarRating";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useUpload } from "@/hooks/use-upload";
import { reportError } from "@/lib/client-errors";
import { cn } from "@/lib/cn";

type ExistingReview = {
  id: Id<"productReviews">;
  rating: number;
  title: string | null;
  body: string;
  imageStorageIds: Id<"_storage">[];
  imageUrls: string[];
};

export function ReviewForm({
  open,
  onOpenChange,
  productId,
  productName,
  existing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: Id<"products">;
  productName: string;
  existing?: ExistingReview | null;
}) {
  const titleId = useId();
  const bodyId = useId();
  const create = useMutation(api.reviews.create);
  const update = useMutation(api.reviews.update);
  const discardImage = useMutation(api.reviews.discardImage);
  const { upload, isUploading } = useUpload("review");
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [imageStorageIds, setImageStorageIds] = useState<Id<"_storage">[]>([]);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setRating(existing?.rating ?? 5);
    setTitle(existing?.title ?? "");
    setBody(existing?.body ?? "");
    setImageStorageIds(existing?.imageStorageIds ?? []);
    setImageUrls(existing?.imageUrls ?? []);
  }, [open, existing]);

  async function onPickFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const remaining = MAX_REVIEW_IMAGES - imageStorageIds.length;
    if (remaining <= 0) {
      toast.error(`You can attach up to ${MAX_REVIEW_IMAGES} photos.`);
      return;
    }
    const selected = Array.from(files).slice(0, remaining);
    try {
      for (const file of selected) {
        const storageId = await upload(file);
        const preview = URL.createObjectURL(file);
        setImageStorageIds((current) => [...current, storageId]);
        setImageUrls((current) => [...current, preview]);
      }
    } catch (error) {
      toast.error(reportError(error).message);
    }
  }

  async function removeImage(index: number) {
    const storageId = imageStorageIds[index];
    if (!storageId) return;
    const nextIds = imageStorageIds.filter((_, i) => i !== index);
    const nextUrls = imageUrls.filter((_, i) => i !== index);
    setImageStorageIds(nextIds);
    setImageUrls(nextUrls);
    const stillAttached = existing?.imageStorageIds.includes(storageId);
    if (!stillAttached) {
      try {
        await discardImage({ storageId });
      } catch {
        // Best-effort cleanup of orphan uploads.
      }
    }
  }

  async function onSubmit() {
    if (pending || isUploading) return;
    setPending(true);
    try {
      if (existing) {
        await update({
          reviewId: existing.id,
          rating,
          title: title.trim() || undefined,
          body,
          imageStorageIds,
        });
        toast.success("Review updated");
      } else {
        await create({
          productId,
          rating,
          title: title.trim() || undefined,
          body,
          imageStorageIds,
        });
        toast.success("Review submitted");
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(reportError(error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit your review" : "Write a review"}</DialogTitle>
          <DialogDescription>{productName}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <StarRatingInput value={rating} onChange={setRating} disabled={pending} />

          <div className="space-y-2">
            <label htmlFor={titleId} className="text-sm font-medium">
              Title <span className="font-normal text-mute">(optional)</span>
            </label>
            <Input
              id={titleId}
              value={title}
              maxLength={MAX_REVIEW_TITLE}
              disabled={pending}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Sum it up"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor={bodyId} className="text-sm font-medium">
              Review
            </label>
            <Textarea
              id={bodyId}
              value={body}
              maxLength={MAX_REVIEW_BODY}
              disabled={pending}
              onChange={(event) => setBody(event.target.value)}
              placeholder={`Share fit, fabric, and how you're wearing it (min ${MIN_REVIEW_BODY} characters).`}
              className="min-h-28 rounded-none bg-soft-cloud"
            />
            <p className="text-xs text-mute">
              {body.trim().length}/{MAX_REVIEW_BODY}
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">
              Photos <span className="font-normal text-mute">(optional, up to {MAX_REVIEW_IMAGES})</span>
            </p>
            {imageUrls.length > 0 ? (
              <ul className="flex flex-wrap gap-2">
                {imageUrls.map((url, index) => (
                  <li key={`${url}-${index}`} className="relative size-20 bg-soft-cloud">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => void removeImage(index)}
                      className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-full bg-ink text-canvas"
                      aria-label="Remove photo"
                    >
                      <X className="size-3.5" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {imageStorageIds.length < MAX_REVIEW_IMAGES ? (
              <label
                className={cn(
                  "inline-flex h-10 cursor-pointer items-center rounded-full bg-soft-cloud px-4 text-sm font-medium",
                  (pending || isUploading) && "pointer-events-none opacity-50",
                )}
              >
                {isUploading ? "Uploading…" : "Add photos"}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="sr-only"
                  disabled={pending || isUploading}
                  onChange={(event) => {
                    void onPickFiles(event.target.files);
                    event.target.value = "";
                  }}
                />
              </label>
            ) : null}
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={pending || isUploading || body.trim().length < MIN_REVIEW_BODY}
            onClick={() => void onSubmit()}
          >
            {pending ? "Saving…" : existing ? "Save changes" : "Submit review"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
