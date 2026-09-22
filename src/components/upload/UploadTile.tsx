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
import { formatBytes, pluralize } from "@/lib/format";
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
  const stillCosts =
    upload.status !== "done" &&
    upload.status !== "failed" &&
    upload.status !== "awaiting_selection";

  return (
    <article className="space-y-4 border-b border-hairline pb-6">
      <header className="flex items-center gap-3">
        <ItemImage
          src={upload.url}
          alt={upload.fileName}
          aspect="aspect-square"
          className="size-20 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-medium">{upload.fileName}</h3>
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
