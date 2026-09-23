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
import { pluralize } from "@/lib/format";
import { routes } from "@/lib/routes";

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
    <div className="mx-auto w-full max-w-4xl space-y-8">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-mute sm:text-sm">
          Add clothes
        </p>
        <h1 className="mt-1 font-display text-3xl font-medium uppercase leading-[0.9] tracking-tight sm:mt-2 sm:text-5xl">
          Upload photos.
        </h1>
        <p className="mt-2 max-w-lg text-sm text-mute sm:mt-4 sm:text-base">
          Drop clear photos of garments. We detect pieces, you confirm, then we
          cut them out into your wardrobe.
        </p>
      </div>

      <DropZone
        onDrop={handleDrop}
        multiple
        maxFiles={LIMITS.maxPhotosPerUpload}
        disabled={busy}
        size="lg"
        title="Drop garment photos here"
        description="Flat lays or hung pieces work best. One clear photo per item or a few together."
        buttonLabel={busy ? "Uploading…" : "Choose photos"}
      />

      {pending.length > 0 ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {pending.map((file) => {
            const pct = Math.round((progress[file.key] ?? 0) * 100);
            return (
              <li
                key={file.key}
                className="flex gap-3 border border-hairline p-3"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={file.previewUrl}
                  alt=""
                  className="size-16 object-cover bg-soft-cloud"
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="truncate text-sm font-medium">{file.name}</p>
                  {file.error ? (
                    <p className="text-xs text-sale">{file.error}</p>
                  ) : file.acceptedBatchId ? (
                    <p className="text-xs text-mute">Queued for scan</p>
                  ) : (
                    <p className="text-xs text-mute tabular-nums">
                      Uploading {pct}%
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      {batchId ? (
        <section className="space-y-6">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-medium">This batch</h2>
            <Link
              href={routes.add}
              className="text-sm text-mute underline underline-offset-4"
            >
              Start new upload
            </Link>
          </div>
          {rows === undefined ? (
            <p className="text-sm text-mute">Loading batch…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-mute">No photos in this batch.</p>
          ) : (
            <div className="space-y-6">
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
          <h2 className="text-sm font-medium">Recent uploads</h2>
          <ul className="divide-y divide-hairline border-y border-hairline">
            {recent.map(({ upload }) => (
              <li key={upload._id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 py-3 text-left hover:bg-soft-cloud"
                  onClick={() => goToBatch(upload.batchId)}
                >
                  <div className="size-12 shrink-0 overflow-hidden bg-soft-cloud">
                    {upload.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={upload.url}
                        alt=""
                        className="size-full object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {upload.fileName}
                    </p>
                    <p className="text-xs text-mute capitalize">
                      {upload.status.replaceAll("_", " ")}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="text-sm text-mute">
        When pieces are ready, find them in{" "}
        <Link href={routes.wardrobe} className="font-medium text-ink underline">
          your wardrobe
        </Link>
        .
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
