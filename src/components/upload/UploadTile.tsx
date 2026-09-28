"use client";

import { Coins, Loader2, RotateCw } from "lucide-react";
import Link from "next/link";
import type { FunctionReturnType } from "convex/server";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { CreditQuote, useCreditQuote } from "@/components/common/CreditQuote";
import { ItemImage } from "@/components/common/ItemImage";
import { JobStepper } from "@/components/common/JobStepper";
import { ImportReview, useUploadItems } from "@/components/upload/ImportReview";
import { cn } from "@/lib/cn";
import { formatBytes, formatPercent, photoLabel, pluralize } from "@/lib/format";
import { routes } from "@/lib/routes";

type UploadRow = FunctionReturnType<typeof api.uploads.listBatch>[number];

const STATUS_LABEL: Record<UploadRow["upload"]["status"], string> = {
  queued: "Queued",
  detecting: "Scanning",
  awaiting_selection: "Choose pieces",
  extracting: "Cutting out",
  done: "Done",
  failed: "Failed",
  partial: "Partial",
};

export function UploadTile({
  row,
  onResume,
  resuming,
}: {
  row: UploadRow;
  onResume: (uploadId: Id<"uploads">) => void;
  resuming: boolean;
}) {
  const { upload, job } = row;
  const detected = upload.detectedCount;
  const selectedCount = upload.selectedIndices?.length ?? detected;
  const quote = useCreditQuote(
    selectedCount && selectedCount > 0
      ? { kind: "extract", items: selectedCount }
      : null,
  );
  const items = useUploadItems(upload._id) ?? [];
  const blocked = items.filter((item) => item.status === "needsCredits");
  const label = photoLabel(
    upload.fileName,
    items.length > 0
      ? items.map((item) => item.name)
      : (upload.candidates ?? []).map((item) => item.name),
    STATUS_LABEL[upload.status],
  );
  const stillCosts =
    upload.status !== "done" &&
    upload.status !== "failed" &&
    upload.status !== "awaiting_selection";
  const scanning = upload.status === "queued" || upload.status === "detecting" || upload.status === "extracting";

  if (scanning) {
    return (
      <ScanPanel
        upload={upload}
        job={job}
        label={label}
      />
    );
  }

  return (
    <article className="space-y-4 border-b border-hairline pb-6">
      <header className="flex items-center gap-3">
        <ItemImage
          src={upload.url}
          alt={label}
          aspect="aspect-square"
          className="size-20 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-medium">{label}</h3>
          <p className="text-xs text-mute">{formatBytes(upload.sizeBytes)}</p>
        </div>
        <span className="rounded-full bg-soft-cloud px-3 py-1 text-xs font-medium">
          {STATUS_LABEL[upload.status]}
        </span>
      </header>

      {upload.status === "awaiting_selection" ? (
        <ImportReview upload={upload} />
      ) : (
        <div className="space-y-4">
          {job ? (
            <JobStepper job={job} />
          ) : (
            <p className="text-sm text-mute">Waiting for a slot…</p>
          )}

          {detected !== undefined ? (
            <p className="text-sm">
              {detected === 0 ? (
                <span className="text-mute">No clothes found in this photo.</span>
              ) : (
                <>
                  Found{" "}
                  <span className="font-medium tabular-nums">
                    {pluralize(detected, "item")}
                  </span>
                  {upload.selectedIndices
                    ? ` · ${upload.selectedIndices.length} selected`
                    : null}
                </>
              )}
            </p>
          ) : null}

          {detected !== undefined && detected > 0 && stillCosts ? (
            <CreditQuote
              quote={quote}
              label={pluralize(selectedCount ?? detected, "selected cutout")}
            />
          ) : null}

          {items.length > 0 ? (
            <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {items.map((item) => (
                <li key={item._id}>
                  <ItemCutout item={item} />
                </li>
              ))}
            </ul>
          ) : null}

          {blocked.length > 0 ? (
            <div className="flex flex-col gap-2 border border-hairline bg-soft-cloud p-3">
              <p className="flex items-center gap-2 text-sm">
                <Coins className="size-4 shrink-0 text-sale" aria-hidden />
                {pluralize(blocked.length, "item")} paused — out of credits mid-extraction.
              </p>
              <button
                type="button"
                className="inline-flex h-10 w-fit items-center gap-2 rounded-full bg-ink px-4 text-sm font-medium text-canvas disabled:opacity-50"
                onClick={() => onResume(upload._id)}
                disabled={resuming}
              >
                {resuming ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RotateCw className="size-4" />
                )}
                Resume extraction
              </button>
            </div>
          ) : null}
        </div>
      )}
    </article>
  );
}

const SCAN_COPY: Record<"queued" | "detecting" | "extracting", { title: string; body: string }> = {
  queued: {
    title: "Queued.",
    body: "This photo is waiting for a scan slot. You can leave this page.",
  },
  detecting: {
    title: "Scanning.",
    body: "Looking for pieces in this photo. You can leave this page — it updates on its own.",
  },
  extracting: {
    title: "Cutting out.",
    body: "Separating the pieces you kept. You can leave this page — it updates on its own.",
  },
};

function ScanPanel({
  upload,
  job,
  label,
}: {
  upload: UploadRow["upload"];
  job: UploadRow["job"];
  label: string;
}) {
  const copy = SCAN_COPY[upload.status as keyof typeof SCAN_COPY];
  const progress = job?.progress ?? 0;
  const moving = upload.status === "detecting" || upload.status === "extracting";
  const named = label !== STATUS_LABEL[upload.status];
  const progressLabel = named
    ? label
    : upload.status === "detecting"
      ? "Detecting items"
      : copy.title.replace(/\.$/, "");

  return (
    <article className="overflow-hidden bg-soft-cloud lg:grid lg:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)]">
      <div className="relative aspect-[4/5] max-h-80 overflow-hidden sm:aspect-[5/4] sm:max-h-96 lg:aspect-auto lg:h-full lg:max-h-none lg:min-h-[22rem]">
        {upload.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={upload.url} alt={label} className="absolute inset-0 size-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-mute">Photo</div>
        )}
        {moving ? (
          <span className="scan-line pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-ink" aria-hidden />
        ) : null}
      </div>
      <div className="flex flex-col justify-center gap-6 px-5 py-6 sm:px-8 sm:py-8">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-mute">This photo</p>
          <h3 className="mt-1 font-display text-3xl font-medium uppercase leading-[0.9] tracking-tight sm:text-4xl">
            {copy.title}
          </h3>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-mute">{copy.body}</p>
        </div>
        <div className="space-y-2" role="status">
          <div className="flex items-baseline justify-between gap-3 text-sm font-medium">
            <span>{progressLabel}</span>
            <span className="tabular-nums text-mute">{formatPercent(progress)}</span>
          </div>
          <div className="h-1 bg-canvas" aria-hidden>
            <div className="h-full bg-ink transition-[width] duration-500" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        </div>
        {job ? (
          <JobStepper job={job} variant="track" />
        ) : (
          <p className="text-sm text-mute">Waiting for a slot…</p>
        )}
      </div>
    </article>
  );
}

function ItemCutout({
  item,
}: {
  item: NonNullable<ReturnType<typeof useUploadItems>>[number];
}) {
  const paused = item.status === "needsCredits";
  const failed = item.status === "failed";
  const extracting = item.status === "extracting";

  const tile = (
    <>
      <ItemImage
        src={item.url}
        alt={item.name}
        aspect="aspect-square"
        className={cn(
          "p-2",
          paused && "ring-1 ring-sale/50",
          failed && "ring-1 ring-sale",
        )}
      />
      <span className="mt-1 block truncate text-[11px] text-mute">{item.name}</span>
    </>
  );

  if (paused || failed || extracting) {
    return (
      <div className="block" title={item.name}>
        {tile}
        <span className="mt-1 inline-block rounded-full border border-hairline px-2 text-[10px]">
          {failed ? "Failed" : paused ? "Needs credits" : "Extracting"}
        </span>
      </div>
    );
  }

  return (
    <Link href={routes.item(item._id)} className="block hover:opacity-90">
      {tile}
    </Link>
  );
}
