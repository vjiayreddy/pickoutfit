"use client";

import { useMutation } from "convex/react";
import { useCallback, useRef, useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { imageUploadMimeType } from "@/lib/image-upload";

export type UploadTarget = "items" | "avatars";
export type UploadProgress = Record<string, number>;
export type UploadEntry = { key: string; file: File };
export type UploadSuccess = {
  key: string;
  file: File;
  storageId: Id<"_storage">;
  error?: undefined;
};
export type UploadFailure = {
  key: string;
  file: File;
  storageId?: undefined;
  error: string;
};
export type UploadResult = UploadSuccess | UploadFailure;

export function isUploadSuccess(result: UploadResult): result is UploadSuccess {
  return result.storageId !== undefined;
}

type UploadResponse = { storageId?: string };
const UPLOAD_TIMEOUT_MS = 10 * 60 * 1000;

function postFile(
  url: string,
  file: File,
  onProgress: (fraction: number) => void,
): Promise<Id<"_storage">> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", url, true);
    request.timeout = UPLOAD_TIMEOUT_MS;
    request.setRequestHeader("Content-Type", imageUploadMimeType(file));

    function cleanup() {
      request.upload.removeEventListener("progress", handleProgress);
      request.removeEventListener("load", handleLoad);
      request.removeEventListener("error", handleError);
      request.removeEventListener("abort", handleAbort);
      request.removeEventListener("timeout", handleTimeout);
    }
    function fail(error: Error) {
      cleanup();
      reject(error);
    }
    function handleProgress(event: ProgressEvent) {
      if (event.lengthComputable && event.total > 0) {
        onProgress(Math.min(0.99, event.loaded / event.total));
      }
    }
    function handleLoad() {
      if (request.status < 200 || request.status >= 300) {
        fail(new Error(`Upload failed (${request.status}). Please try again.`));
        return;
      }
      let body: UploadResponse;
      try {
        body = JSON.parse(request.responseText) as UploadResponse;
      } catch {
        fail(new Error("Upload did not return a storage id."));
        return;
      }
      if (!body.storageId) {
        fail(new Error("Upload did not return a storage id."));
        return;
      }
      cleanup();
      onProgress(1);
      resolve(body.storageId as Id<"_storage">);
    }
    function handleError() {
      fail(new Error("Upload failed. Check your connection and try again."));
    }
    function handleAbort() {
      fail(new Error("Upload cancelled. Please try again."));
    }
    function handleTimeout() {
      fail(new Error("Upload timed out. Check your connection and retry this photo."));
    }

    request.upload.addEventListener("progress", handleProgress);
    request.addEventListener("load", handleLoad);
    request.addEventListener("error", handleError);
    request.addEventListener("abort", handleAbort);
    request.addEventListener("timeout", handleTimeout);
    try {
      request.send(file);
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

async function runPool<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const lanes = Array.from(
    { length: Math.max(1, Math.min(limit, items.length || 1)) },
    async () => {
      for (let index = cursor++; index < items.length; index = cursor++) {
        results[index] = await worker(items[index]!);
      }
    },
  );
  await Promise.all(lanes);
  return results;
}

export function useUpload(target: UploadTarget = "items") {
  const generateItemUrl = useMutation(api.uploads.generateUploadUrl);
  const generateAvatarUrl = useMutation(api.avatars.generateUploadUrl);
  const [progress, setProgress] = useState<UploadProgress>({});
  const inFlight = useRef(0);
  const [isUploading, setIsUploading] = useState(false);

  const upload = useCallback(
    async (file: File, key: string = file.name): Promise<Id<"_storage">> => {
      inFlight.current += 1;
      setIsUploading(true);
      setProgress((current) => ({ ...current, [key]: 0 }));
      try {
        const url =
          target === "avatars"
            ? await generateAvatarUrl({})
            : await generateItemUrl({});
        return await postFile(url, file, (fraction) =>
          setProgress((current) => ({ ...current, [key]: fraction })),
        );
      } finally {
        inFlight.current -= 1;
        if (inFlight.current === 0) setIsUploading(false);
      }
    },
    [generateAvatarUrl, generateItemUrl, target],
  );

  const uploadMany = useCallback(
    async (
      entries: readonly UploadEntry[],
      concurrency = 4,
    ): Promise<UploadResult[]> =>
      runPool(entries, concurrency, async ({ key, file }): Promise<UploadResult> => {
        try {
          return { key, file, storageId: await upload(file, key) };
        } catch (error) {
          return {
            key,
            file,
            error: error instanceof Error ? error.message : "Upload failed.",
          };
        }
      }),
    [upload],
  );

  const reset = useCallback(() => setProgress({}), []);

  return { upload, uploadMany, progress, isUploading, reset };
}
