"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { LIMITS } from "@convex/shared/credits";
import {
  describeRejection,
  DropZone,
  type FileRejection,
} from "@/components/upload/DropZone";
import { UploadTile } from "@/components/upload/UploadTile";
import {
  isUploadSuccess,
  useUpload,
  type UploadSuccess,
} from "@/hooks/use-upload";
import { toClientError } from "@/lib/client-errors";
import { imageUploadMimeType } from "@/lib/image-upload";
import { photoLabel, pluralize } from "@/lib/format";
import { routes } from "@/lib/routes";

const STEPS = [
  {
    title: "Photograph",
    body: "A flat lay or a piece on a hanger. Keep the garment fully in frame.",
  },
  {
    title: "We scan",
    body: "Every piece in the photo is detected. You choose what to keep.",
  },
  {
    title: "Cut out",
    body: "Confirmed pieces are cut out and added to your wardrobe.",
  },
] as const;

const UPLOAD_STATUS: Record<string, string> = {
  queued: "Queued",
  detecting: "Scanning",
  awaiting_selection: "Choose pieces",
  extracting: "Cutting out",
  done: "In wardrobe",
  failed: "Failed",
  partial: "Partial",
};

type PendingFile = {
  key: string;
  name: string;
  sizeBytes: number;
  previewUrl: string;
  error?: string;
  acceptedBatchId?: string;
};

function AddClothesInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const batchId = searchParams.get("batch");

  const rows = useQuery(
    api.uploads.listBatch,
    batchId ? { batchId } : "skip",
  );
  const recent = useQuery(api.uploads.listRecent, { limit: 8 });
  const createBatch = useMutation(api.uploads.createBatch);
  const resumeUpload = useMutation(api.uploads.resume);
  const { uploadMany, progress } = useUpload("items");

  const [pending, setPending] = useState<PendingFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [resuming, setResuming] = useState<Id<"uploads"> | null>(null);
  const previewUrls = useRef<Map<string, string>>(new Map());
  const sourceFiles = useRef<Map<string, File>>(new Map());
  const working = useRef(false);
  const acceptedBatches = useRef(new Map<string, string>());
  const uploaded = useRef<UploadSuccess[]>([]);

  useEffect(
    () => () => {
      for (const url of previewUrls.current.values()) URL.revokeObjectURL(url);
      previewUrls.current.clear();
      sourceFiles.current.clear();
    },
    [],
  );

  function goToBatch(id: string) {
    router.replace(`${routes.add}?batch=${encodeURIComponent(id)}`);
  }

  const releaseFileResources = useCallback((keys: ReadonlySet<string>) => {
    for (const key of keys) {
      const url = previewUrls.current.get(key);
      if (url) URL.revokeObjectURL(url);
      previewUrls.current.delete(key);
      sourceFiles.current.delete(key);
      acceptedBatches.current.delete(key);
    }
    uploaded.current = uploaded.current.filter((entry) => !keys.has(entry.key));
  }, []);

  useEffect(() => {
    if (!batchId || rows === undefined) return;
    const visible = new Set(
      [...acceptedBatches.current]
        .filter(([, acceptedBatchId]) => acceptedBatchId === batchId)
        .map(([key]) => key),
    );
    if (visible.size > 0) releaseFileResources(visible);
  }, [batchId, releaseFileResources, rows]);

  async function queueBatch(files: readonly UploadSuccess[]) {
    if (files.length === 0) return;
    const queued = new Set(files.map(({ key }) => key));
    try {
      const batch = await createBatch({
        files: files.map(({ file, storageId }) => ({
          storageId,
          fileName: file.name,
          mimeType: imageUploadMimeType(file),
          sizeBytes: file.size,
        })),
      });
      for (const key of queued) acceptedBatches.current.set(key, batch.batchId);
      setPending((current) =>
        current.map((entry) =>
          queued.has(entry.key)
            ? { ...entry, error: undefined, acceptedBatchId: batch.batchId }
            : entry,
        ),
      );
      goToBatch(batch.batchId);
    } catch (caught) {
      const error = toClientError(caught);
      setPending((current) =>
        current.map((entry) =>
          queued.has(entry.key)
            ? { ...entry, error: entry.error ?? error.message }
            : entry,
        ),
      );
      toast.error(error.message);
    }
  }

  async function handleDrop(accepted: File[], rejections: FileRejection[]) {
    for (const rejection of rejections) toast.error(describeRejection(rejection));
    if (accepted.length === 0 || working.current) return;

    const files = accepted.slice(0, LIMITS.maxPhotosPerUpload);
    if (accepted.length > files.length) {
      toast.warning(
        `Only the first ${pluralize(LIMITS.maxPhotosPerUpload, "photo")} were taken from this drop.`,
      );
    }

    const stamp = crypto.randomUUID();
    const entries = files.map((file, index) => ({
      key: `${stamp}-${index}-${file.name}`,
      file,
      previewUrl: URL.createObjectURL(file),
    }));
    for (const entry of entries) {
      previewUrls.current.set(entry.key, entry.previewUrl);
      sourceFiles.current.set(entry.key, entry.file);
    }
    setPending((current) => [
      ...current,
      ...entries.map(({ key, file, previewUrl }) => ({
        key,
        name: file.name,
        sizeBytes: file.size,
        previewUrl,
      })),
    ]);
    working.current = true;
    setBusy(true);

    try {
      const results = await uploadMany(
        entries.map(({ key, file }) => ({ key, file })),
        4,
      );
      for (const result of results) {
        if (result.error) toast.error(`${result.file.name}: ${result.error}`);
      }
      setPending((current) =>
        current.map((file) => {
          const result = results.find((entry) => entry.key === file.key);
          return result?.error ? { ...file, error: result.error } : file;
        }),
      );
      const successes = results.filter(isUploadSuccess);
      uploaded.current.push(...successes);
      await queueBatch(successes);
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  async function handleResume(uploadId: Id<"uploads">) {
    setResuming(uploadId);
    try {
      await resumeUpload({ uploadId });
      toast.success("Extraction resumed.");
    } catch (caught) {
      toast.error(toClientError(caught).message);
    } finally {
      setResuming(null);
    }
  }

  return (
    <div className="space-y-8 sm:space-y-12">
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <p className="text-xs font-medium uppercase tracking-wide text-mute sm:text-sm">
            Add clothes
          </p>
          <h1 className="mt-1 font-display text-4xl font-medium uppercase leading-[0.9] tracking-tight sm:text-5xl lg:text-6xl">
            Upload photos.
          </h1>
          <p className="mt-3 max-w-xl text-sm text-mute sm:mt-4 sm:text-base">
            Clear photos of garments. We find the pieces, you confirm them, then
            they land in your wardrobe.
          </p>
        </div>
        <Link
          href={routes.wardrobe}
          className="hidden h-12 items-center justify-center rounded-full bg-soft-cloud px-6 text-base font-medium text-ink lg:inline-flex"
        >
          View wardrobe
        </Link>
      </header>

      <DropZone
        onDrop={handleDrop}
        multiple
        maxFiles={LIMITS.maxPhotosPerUpload}
        disabled={busy}
        size="lg"
        title="Drop garment photos here"
        description="Flat lays or hung pieces work best. One clear photo per item, or a few together."
        buttonLabel={busy ? "Uploading…" : "Choose photos"}
        className="bg-soft-cloud"
      />

      <ol className="grid gap-3 sm:grid-cols-3 sm:gap-4">
        {STEPS.map((step, index) => (
          <li key={step.title} className="bg-soft-cloud px-4 py-4 sm:px-5 sm:py-5">
            <p className="text-xs font-medium tabular-nums text-mute">
              {String(index + 1).padStart(2, "0")}
            </p>
            <p className="mt-2 text-base font-medium">{step.title}</p>
            <p className="mt-1 text-sm leading-relaxed text-mute">{step.body}</p>
          </li>
        ))}
      </ol>

      {pending.length > 0 ? (
        <section className="space-y-4">
          <h2 className="text-sm font-medium">Uploading now</h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
            {pending.map((file) => {
              const pct = Math.round((progress[file.key] ?? 0) * 100);
              return (
                <li key={file.key} className="min-w-0">
                  <div className="relative aspect-square overflow-hidden bg-soft-cloud">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={file.previewUrl}
                      alt=""
                      className="size-full object-cover"
                    />
                    {!file.error && !file.acceptedBatchId ? (
                      <div className="absolute inset-x-0 bottom-0 h-1 bg-canvas/70">
                        <div className="h-full bg-ink" style={{ width: `${pct}%` }} />
                      </div>
                    ) : null}
                  </div>
                  <p className="mt-2 truncate text-sm font-medium">
                    {photoLabel(file.name, [], "Photo")}
                  </p>
                  {file.error ? (
                    <p className="mt-0.5 text-xs text-sale">{file.error}</p>
                  ) : file.acceptedBatchId ? (
                    <p className="mt-0.5 text-xs text-mute">Queued for scan</p>
                  ) : (
                    <p className="mt-0.5 text-xs text-mute tabular-nums">Uploading {pct}%</p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {batchId ? (
        <section className="space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-base font-medium">This batch</h2>
            <Link
              href={routes.add}
              className="inline-flex h-11 items-center justify-center rounded-full bg-soft-cloud px-5 text-sm font-medium text-ink sm:h-10"
            >
              Start new upload
            </Link>
          </div>
          {rows === undefined ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 4 }, (_, index) => (
                <div key={index} className="aspect-square animate-pulse bg-soft-cloud" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <p className="bg-soft-cloud px-5 py-10 text-center text-sm text-mute">
              No photos in this batch.
            </p>
          ) : (
            <div className="space-y-8">
              {rows.map((row) => (
                <UploadTile
                  key={row.upload._id}
                  row={row}
                  onResume={handleResume}
                  resuming={resuming === row.upload._id}
                />
              ))}
            </div>
          )}
        </section>
      ) : null}

      {!batchId && recent && recent.length > 0 ? (
        <section className="space-y-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-base font-medium">Recent uploads</h2>
            <p className="text-xs font-medium text-mute tabular-nums">
              {pluralize(recent.length, "photo")}
            </p>
          </div>
          <ul className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 sm:gap-x-4 lg:grid-cols-4 xl:grid-cols-5">
            {recent.map(({ upload }) => {
              const failed = upload.status === "failed";
              return (
                <li key={upload._id} className="min-w-0">
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => goToBatch(upload.batchId)}
                  >
                    <div className="aspect-square overflow-hidden bg-soft-cloud">
                      {upload.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={upload.url}
                          alt=""
                          className="size-full object-cover"
                        />
                      ) : null}
                    </div>
                    <p className="mt-2 truncate text-sm font-medium">
                      {photoLabel(
                        upload.fileName,
                        (upload.candidates ?? []).map((item) => item.name),
                        UPLOAD_STATUS[upload.status] ?? "Photo",
                      )}
                    </p>
                    <p className={`mt-0.5 text-xs ${failed ? "text-sale" : "text-mute"}`}>
                      {UPLOAD_STATUS[upload.status] ?? upload.status.replaceAll("_", " ")}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <p className="text-sm text-mute">
        Ready pieces show up in{" "}
        <Link href={routes.wardrobe} className="font-medium text-ink underline underline-offset-4">
          your wardrobe
        </Link>
        .{" "}
        <Link href={routes.gridDemo} className="font-medium text-ink underline underline-offset-4">
          Grid demo
        </Link>
      </p>
    </div>
  );
}

export function AddClothes() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <div className="h-10 w-48 animate-pulse bg-soft-cloud" />
          <div className="h-56 animate-pulse bg-soft-cloud" />
        </div>
      }
    >
      <AddClothesInner />
    </Suspense>
  );
}
