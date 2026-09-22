"use client";

import { ImagePlus, UploadCloud } from "lucide-react";
import {
  useCallback,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type ReactNode,
} from "react";
import {
  ACCEPTED_IMAGE_TYPES,
  MAX_UPLOAD_BYTES,
} from "@convex/shared/wardrobe";
import { cn } from "@/lib/cn";
import { formatBytes } from "@/lib/format";

export type FileRejection = {
  file: File;
  errors: Array<{ code: string; message: string }>;
};

type DropZoneProps = {
  onDrop: (accepted: File[], rejections: FileRejection[]) => void;
  multiple?: boolean;
  maxFiles?: number;
  disabled?: boolean;
  size?: "sm" | "lg";
  title: string;
  description: string;
  buttonLabel?: string;
  hint?: ReactNode;
  className?: string;
};

const ACCEPT_SET = new Set(Object.keys(ACCEPTED_IMAGE_TYPES));
const ACCEPT_ATTR = Object.keys(ACCEPTED_IMAGE_TYPES).join(",");

function classify(files: FileList | File[], maxFiles?: number): {
  accepted: File[];
  rejections: FileRejection[];
} {
  const list = Array.from(files);
  const accepted: File[] = [];
  const rejections: FileRejection[] = [];
  for (const file of list) {
    if (!ACCEPT_SET.has(file.type) && file.type !== "") {
      // Also allow extension-only empty type if extension matches
      const ext = `.${file.name.split(".").pop()?.toLowerCase() ?? ""}`;
      const ok = Object.values(ACCEPTED_IMAGE_TYPES).some((exts) =>
        (exts as readonly string[]).includes(ext),
      );
      if (!ok) {
        rejections.push({
          file,
          errors: [{ code: "file-invalid-type", message: "Invalid type" }],
        });
        continue;
      }
    } else if (file.type && !ACCEPT_SET.has(file.type)) {
      rejections.push({
        file,
        errors: [{ code: "file-invalid-type", message: "Invalid type" }],
      });
      continue;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      rejections.push({
        file,
        errors: [{ code: "file-too-large", message: "Too large" }],
      });
      continue;
    }
    accepted.push(file);
  }
  if (maxFiles !== undefined && accepted.length > maxFiles) {
    const overflow = accepted.splice(maxFiles);
    for (const file of overflow) {
      rejections.push({
        file,
        errors: [{ code: "too-many-files", message: "Too many files" }],
      });
    }
  }
  return { accepted, rejections };
}

export function DropZone({
  onDrop,
  multiple = false,
  maxFiles,
  disabled = false,
  size = "sm",
  title,
  description,
  buttonLabel = "Choose photos",
  hint,
  className,
}: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [dragReject, setDragReject] = useState(false);

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      const { accepted, rejections } = classify(files, maxFiles);
      onDrop(accepted, rejections);
    },
    [maxFiles, onDrop],
  );

  function onDragOver(event: DragEvent) {
    event.preventDefault();
    if (disabled) return;
    setDragActive(true);
    const items = event.dataTransfer.items;
    let reject = false;
    for (const item of Array.from(items)) {
      if (item.kind === "file" && item.type && !ACCEPT_SET.has(item.type)) {
        reject = true;
        break;
      }
    }
    setDragReject(reject);
  }

  function onDragLeave(event: DragEvent) {
    event.preventDefault();
    setDragActive(false);
    setDragReject(false);
  }

  function onDropFiles(event: DragEvent) {
    event.preventDefault();
    setDragActive(false);
    setDragReject(false);
    if (disabled) return;
    handleFiles(event.dataTransfer.files);
  }

  function onChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) handleFiles(event.target.files);
    event.target.value = "";
  }

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDropFiles}
      className={cn(
        "group relative flex flex-col items-center justify-center gap-3 border border-dashed border-hairline bg-canvas text-center transition-colors",
        size === "lg" ? "min-h-56 px-5 py-6" : "px-4 py-5",
        disabled
          ? "pointer-events-none opacity-60"
          : "cursor-pointer hover:border-ink/40 hover:bg-soft-cloud/60",
        dragActive && !dragReject && "border-ink bg-soft-cloud",
        dragReject && "border-sale bg-sale/5",
        className,
      )}
      onClick={() => {
        if (!disabled) inputRef.current?.click();
      }}
      role="presentation"
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTR}
        multiple={multiple}
        disabled={disabled}
        className="sr-only"
        onChange={onChange}
        onClick={(e) => e.stopPropagation()}
      />
      <div className={cn("text-ink", size === "lg" ? "size-7" : "size-6")} aria-hidden>
        {dragActive ? (
          <UploadCloud className="size-5" />
        ) : (
          <ImagePlus className="size-5" />
        )}
      </div>
      <div className="space-y-2">
        <p
          className={cn(
            "font-medium text-balance",
            size === "lg" ? "text-base" : "text-sm",
          )}
        >
          {dragActive ? "Drop to upload" : title}
        </p>
        <p className="mx-auto max-w-md text-sm leading-relaxed text-mute">
          {description}
        </p>
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          inputRef.current?.click();
        }}
        className={cn(
          "rounded-full font-medium transition active:scale-95 active:opacity-50 disabled:opacity-50",
          size === "lg"
            ? "h-12 bg-ink px-8 text-base text-canvas"
            : "h-10 border border-hairline bg-canvas px-5 text-sm text-ink",
        )}
      >
        {buttonLabel}
      </button>
      <p className="text-xs text-mute">
        {hint ?? `JPG, PNG or WebP · up to ${formatBytes(MAX_UPLOAD_BYTES)} each`}
      </p>
    </div>
  );
}

export function describeRejection(rejection: FileRejection): string {
  const reason = rejection.errors[0];
  if (!reason) return `${rejection.file.name} was not accepted.`;
  if (reason.code === "file-too-large")
    return `${rejection.file.name} is larger than ${formatBytes(MAX_UPLOAD_BYTES)}.`;
  if (reason.code === "file-invalid-type")
    return `${rejection.file.name} is not a JPG, PNG or WebP image.`;
  if (reason.code === "too-many-files")
    return `${rejection.file.name} went over the file limit.`;
  return `${rejection.file.name}: ${reason.message}`;
}
