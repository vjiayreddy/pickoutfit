"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Check, ExternalLink, Loader2, ScanLine, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { PRESENTATIONS, type Presentation } from "@convex/shared/wardrobe";
import { CATEGORY_LABELS } from "@convex/shared/wardrobe";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { describeRejection, DropZone, type FileRejection } from "@/components/upload/DropZone";
import { useNow } from "@/hooks/use-now";
import { isUploadSuccess, useUpload } from "@/hooks/use-upload";
import { reportError, toClientError } from "@/lib/client-errors";
import { cn } from "@/lib/cn";
import { formatInr, pluralize } from "@/lib/format";
import { imageUploadMimeType } from "@/lib/image-upload";
import { routes } from "@/lib/routes";
import { useVendor } from "./VendorDesk";

type Row = FunctionReturnType<typeof api.vendorUploads.listRecent>[number];
type UploadView = Row["upload"];

const STATUS_LABEL: Record<UploadView["status"], string> = {
  queued: "Queued",
  detecting: "Scanning",
  awaiting_selection: "Choose pieces",
  extracting: "Cutting out",
  done: "Drafts ready",
  failed: "Failed",
  partial: "Partly done",
};

const PRESENTATION_LABEL: Record<Presentation, string> = {
  masculine: "Men",
  feminine: "Women",
  neutral: "Unisex",
};

export function VendorImport() {
  const { vendor } = useVendor();
  const now = useNow();
  const quota = useQuery(api.vendorUploads.quota, { now });
  const limits = useQuery(api.vendorUploads.limits, {});
  const rows = useQuery(api.vendorUploads.listRecent, { limit: 12 });
  const createBatch = useMutation(api.vendorUploads.createBatch);
  const { uploadMany } = useUpload("vendor");
  const [busy, setBusy] = useState(false);
  const working = useRef(false);

  const maxPhotos = limits?.maxPhotosPerBatch ?? 6;
  const quotaLeft = quota ? Math.max(0, quota.limit - quota.used) : null;
  const canImport = vendor.status !== "suspended" && vendor.status !== "closed";

  async function handleDrop(accepted: File[], rejections: FileRejection[]) {
    for (const rejection of rejections) toast.error(describeRejection(rejection));
    if (accepted.length === 0 || working.current) return;
    const files = accepted.slice(0, maxPhotos);
    if (accepted.length > files.length) {
      toast.warning(`Only the first ${pluralize(maxPhotos, "photo")} were taken.`);
    }
    working.current = true;
    setBusy(true);
    try {
      const results = await uploadMany(files.map((file, index) => ({ key: `${index}-${file.name}`, file })), 3);
      for (const result of results) {
        if (result.error) toast.error(`${result.file.name}: ${result.error}`);
      }
      const successes = results.filter(isUploadSuccess);
      if (successes.length === 0) return;
      await createBatch({
        files: successes.map(({ file, storageId }) => ({
          storageId,
          fileName: file.name,
          mimeType: imageUploadMimeType(file),
          sizeBytes: file.size,
        })),
      });
      toast.success(`Scanning ${pluralize(successes.length, "photo")}.`);
    } catch (caught) {
      toast.error(toClientError(caught).message);
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <DropZone
          size="lg"
          multiple
          maxFiles={maxPhotos}
          disabled={busy || !canImport || quotaLeft === 0}
          onDrop={(accepted, rejections) => void handleDrop(accepted, rejections)}
          title="Scan a look photo"
          description="Lookbook shots, model photos or flat lays. Every garment in the frame is detected and you pick which become products."
          buttonLabel={busy ? "Uploading…" : "Choose photos"}
          hint={`Up to ${pluralize(maxPhotos, "photo")} at a time. Scanning is free; each cutout uses one extraction.`}
        />
        <aside className="space-y-4 bg-soft-cloud p-5">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-mute">This month&apos;s extractions</p>
            <p className="mt-1 text-2xl font-medium tracking-tight">
              {quota ? `${quota.used} / ${quota.limit}` : "—"}
            </p>
            <span className="mt-2 block h-1 w-full bg-hairline">
              <span
                className="block h-1 bg-ink"
                style={{ width: quota && quota.limit ? `${Math.min(100, (quota.used / quota.limit) * 100)}%` : 0 }}
              />
            </span>
          </div>
          <p className="text-sm leading-relaxed text-mute">
            {quotaLeft === 0
              ? "You've used this month's quota. Upgrade your plan or wait for next month."
              : `${quotaLeft ?? "—"} left on the ${vendor.plan} plan. Failed cutouts are refunded.`}
          </p>
          {!canImport ? (
            <p className="text-sm text-sale">Imports are paused while the store is {vendor.status}.</p>
          ) : null}
        </aside>
      </div>

      <section className="space-y-4">
        <h2 className="text-lg font-medium tracking-tight">Recent look photos</h2>
        {rows === undefined ? (
          <div className="h-32 animate-pulse bg-soft-cloud" />
        ) : rows.length === 0 ? (
          <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 border border-dashed border-hairline text-center">
            <ScanLine className="size-5 text-mute" aria-hidden />
            <p className="text-sm text-mute">Nothing scanned yet. Drop a look photo above.</p>
          </div>
        ) : (
          <ul className="space-y-4">
            {rows.map((row) => (
              <li key={row.upload._id}>
                <ImportRow row={row} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ImportRow({ row }: { row: Row }) {
  const { upload, job } = row;
  const [open, setOpen] = useState(upload.status === "awaiting_selection");
  const showReview = upload.status === "awaiting_selection";
  const showDrafts = upload.status === "extracting" || upload.status === "done" || upload.status === "partial";
  const found = upload.detectedCount ?? upload.candidates?.length;

  return (
    <article className="border border-hairline">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-4 p-3 text-left"
        aria-expanded={open}
      >
        <div className="size-16 shrink-0 bg-soft-cloud">
          {upload.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={upload.url} alt="" className="size-16 object-cover" />
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{upload.fileName}</p>
          <p className="text-xs text-mute">
            {STATUS_LABEL[upload.status]}
            {typeof found === "number" && upload.status !== "queued" && upload.status !== "detecting"
              ? ` · ${pluralize(found, "piece")} found`
              : ""}
            {upload.selectedIndices ? ` · ${pluralize(upload.selectedIndices.length, "piece")} imported` : ""}
          </p>
          {job?.error && (upload.status === "failed" || upload.status === "partial") ? (
            <p className="mt-1 text-xs text-sale">{job.error}</p>
          ) : null}
        </div>
        {upload.status === "detecting" || upload.status === "queued" || upload.status === "extracting" ? (
          <Loader2 className="size-4 animate-spin text-mute" aria-hidden />
        ) : null}
      </button>
      {open && showReview ? (
        <div className="border-t border-hairline p-4">
          <ImportReview upload={upload} />
        </div>
      ) : null}
      {open && showDrafts ? (
        <div className="border-t border-hairline p-4">
          <ImportDrafts uploadId={upload._id} />
        </div>
      ) : null}
      {open && upload.status === "failed" ? (
        <div className="border-t border-hairline p-4">
          <DiscardButton uploadId={upload._id} />
        </div>
      ) : null}
    </article>
  );
}

function ImportReview({ upload }: { upload: UploadView }) {
  const candidates = upload.candidates ?? [];
  const now = useNow();
  const quota = useQuery(api.vendorUploads.quota, { now });
  const confirm = useMutation(api.vendorUploads.confirmSelection);
  const [selected, setSelected] = useState<ReadonlySet<number>>(() => new Set(candidates.map((_, index) => index)));
  const [presentation, setPresentation] = useState<Presentation>("neutral");
  const [price, setPrice] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const quotaLeft = quota ? Math.max(0, quota.limit - quota.used) : null;
  const overQuota = quotaLeft !== null && selected.size > quotaLeft;

  function toggle(index: number) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  async function submit() {
    if (pending || selected.size === 0) return;
    setPending(true);
    setError(null);
    try {
      const priceInr = price.trim() === "" ? 0 : Number(price);
      await confirm({
        uploadId: upload._id,
        indices: [...selected].sort((a, b) => a - b),
        presentation,
        priceInr: Number.isFinite(priceInr) ? priceInr : 0,
      });
      toast.success(`Creating ${pluralize(selected.size, "draft")}. Cutouts are on the way.`);
    } catch (caught) {
      setError(reportError(caught, "Could not import these pieces.").message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <fieldset disabled={pending} className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="flex min-w-0 items-start justify-center bg-soft-cloud p-3">
          {upload.url ? (
            <div className="relative w-fit max-w-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={upload.url} alt={`Look photo: ${upload.fileName}`} className="block max-h-96 max-w-full" />
              {candidates.map((item, index) => {
                const [x0, y0, x1, y1] = item.bbox;
                if (![x0, y0, x1, y1].every(Number.isFinite) || x1 <= x0 || y1 <= y0) return null;
                return (
                  <div
                    key={index}
                    aria-hidden
                    className={cn(
                      "pointer-events-none absolute border-2 transition-colors",
                      selected.has(index) ? "border-canvas bg-ink/15" : "border-canvas/60",
                    )}
                    style={{
                      left: `${x0 * 100}%`,
                      top: `${y0 * 100}%`,
                      width: `${(x1 - x0) * 100}%`,
                      height: `${(y1 - y0) * 100}%`,
                    }}
                  >
                    <span className="absolute top-0 left-0 bg-ink px-1 text-[10px] text-canvas">{index + 1}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-mute">Photo unavailable</p>
          )}
        </div>
        <div className="space-y-4">
          <ul className="space-y-2">
            {candidates.map((item, index) => (
              <li key={index}>
                <label
                  className={cn(
                    "flex cursor-pointer items-start gap-3 border border-hairline p-3 transition",
                    selected.has(index) && "border-ink bg-soft-cloud",
                  )}
                >
                  <input
                    type="checkbox"
                    className="mt-1 size-4 accent-ink"
                    checked={selected.has(index)}
                    onChange={() => toggle(index)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">
                      {index + 1}. {item.name}
                    </span>
                    <span className="text-xs text-mute">
                      {CATEGORY_LABELS[item.category]}
                      {item.colours.primary ? ` · ${item.colours.primary}` : ""}
                      {item.material ? ` · ${item.material}` : ""}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-mute">Section</span>
              <select
                value={presentation}
                onChange={(event) => setPresentation(event.target.value as Presentation)}
                className="h-10 w-full bg-soft-cloud px-3 text-sm"
              >
                {PRESENTATIONS.map((value) => (
                  <option key={value} value={value}>
                    {PRESENTATION_LABEL[value]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-mute">Starting price (₹, optional)</span>
              <input
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                placeholder="Set per product later"
                className="h-10 w-full bg-soft-cloud px-3 text-sm"
              />
            </label>
          </div>
        </div>
      </fieldset>

      <p className="text-xs text-mute">
        {pluralize(selected.size, "extraction")} will be used
        {quotaLeft !== null ? ` · ${quotaLeft} left this month` : ""}.
        {overQuota ? " Deselect some pieces or upgrade your plan." : ""}
      </p>
      {error ? (
        <p className="text-sm text-sale" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={pending || selected.size === 0 || overQuota} onClick={() => void submit()}>
          {pending ? <Loader2 className="animate-spin" /> : <Check />}
          Import {selected.size > 0 ? pluralize(selected.size, "piece") : "pieces"}
        </Button>
        <DiscardButton uploadId={upload._id} disabled={pending} />
      </div>
    </div>
  );
}

function DiscardButton({ uploadId, disabled }: { uploadId: Id<"uploads">; disabled?: boolean }) {
  const remove = useMutation(api.vendorUploads.remove);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function discard() {
    setPending(true);
    try {
      await remove({ uploadId });
      toast.success("Photo discarded.");
    } catch (caught) {
      toast.error(toClientError(caught).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button type="button" variant="secondary" disabled={disabled || pending} onClick={() => setConfirmOpen(true)}>
        {pending ? <Loader2 className="animate-spin" /> : <Trash2 />}
        Discard photo
      </Button>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Discard this photo?"
        confirmLabel="Discard"
        destructive
        onConfirm={discard}
      />
    </>
  );
}

function ImportDrafts({ uploadId }: { uploadId: Id<"uploads"> }) {
  const detail = useQuery(api.vendorUploads.get, { uploadId });
  const publish = useMutation(api.vendorProducts.publish);
  const { vendor } = useVendor();
  const [publishing, setPublishing] = useState<Id<"products"> | null>(null);

  if (detail === undefined) return <div className="h-24 animate-pulse bg-soft-cloud" />;
  if (!detail) return null;
  const stepFor = (productId: Id<"products">) =>
    detail.job?.steps.find((step) => step.meta?.productId === productId);

  async function publishOne(productId: Id<"products">) {
    setPublishing(productId);
    try {
      await publish({ productId });
      toast.success("Product is live.");
    } catch (caught) {
      toast.error(toClientError(caught).message);
    } finally {
      setPublishing(null);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-mute">
        {pluralize(detail.products.length, "draft")} from this look. Open a draft to set price, sizes and stock, or
        publish straight away.
      </p>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {detail.products.map((product) => {
          const step = stepFor(product.id);
          const cutting = step?.status === "running" || step?.status === "pending";
          const failed = step?.status === "failed";
          const cutout = product.images.find((image) => image.kind === "cutout");
          return (
            <li key={product.id} className="flex gap-3 border border-hairline p-3">
              <div className="relative size-20 shrink-0 bg-soft-cloud">
                {cutout?.url ?? product.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cutout?.url ?? product.imageUrl ?? ""} alt="" className="size-20 object-contain" />
                ) : null}
                {cutting ? (
                  <span className="absolute inset-0 flex items-center justify-center bg-canvas/60">
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  </span>
                ) : null}
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <p className="truncate text-sm font-medium">{product.name}</p>
                <p className="text-xs text-mute">
                  {product.sku ?? "—"} · {product.status === "active" ? "Live" : product.status}
                  {product.priceInr > 0 ? ` · ${formatInr(product.priceInr)}` : " · no price"}
                </p>
                {failed ? (
                  <p className="text-xs text-sale">Cutout failed — the look photo stays as the cover.</p>
                ) : cutting ? (
                  <p className="text-xs text-mute">Cutting out…</p>
                ) : null}
                <div className="flex flex-wrap gap-2 pt-1">
                  <Link
                    href={routes.vendorProduct(product.id)}
                    className="inline-flex h-8 items-center gap-1 rounded-full bg-soft-cloud px-3 text-xs font-medium"
                  >
                    Edit
                    <ExternalLink className="size-3" aria-hidden />
                  </Link>
                  {product.status === "draft" && !cutting && vendor.status === "active" ? (
                    <button
                      type="button"
                      disabled={publishing === product.id || product.priceInr <= 0}
                      title={product.priceInr <= 0 ? "Set a price first" : undefined}
                      onClick={() => void publishOne(product.id)}
                      className="inline-flex h-8 items-center gap-1 rounded-full bg-ink px-3 text-xs font-medium text-canvas disabled:opacity-50"
                    >
                      {publishing === product.id ? <Loader2 className="size-3 animate-spin" /> : null}
                      Publish
                    </button>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
