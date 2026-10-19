"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  Eye,
  EyeOff,
  ImagePlus,
  Package,
  Pencil,
  Plus,
  Search,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { brandSlug } from "@convex/shared/brands";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/vendor/VendorProfileForm";
import { useVendor } from "@/components/vendor/VendorDesk";
import { useUpload } from "@/hooks/use-upload";
import { reportError } from "@/lib/client-errors";
import { cn } from "@/lib/cn";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

type BrandRow = FunctionReturnType<typeof api.brands.list>[number];
type EditorState = { mode: "create" } | { mode: "edit"; row: BrandRow };
type StatusFilter = "all" | "active" | "hidden";

function brandInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

function BrandMark({
  name,
  logoUrl,
  size = "md",
}: {
  name: string;
  logoUrl: string | null;
  size?: "md" | "lg";
}) {
  const box = size === "lg" ? "size-16" : "size-12";
  const text = size === "lg" ? "text-lg" : "text-sm";
  return (
    <div className={cn("shrink-0 overflow-hidden bg-soft-cloud", box)}>
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="" className="size-full object-cover" />
      ) : (
        <div className={cn("flex size-full items-center justify-center font-medium tracking-tight text-ink", text)}>
          {brandInitials(name)}
        </div>
      )}
    </div>
  );
}

export function VendorBrands() {
  const me = useVendor();
  const canEdit =
    me.vendor.status !== "suspended" &&
    (me.membership.role === "owner" || me.membership.role === "manager");
  const rows = useQuery(api.brands.list, { activeOnly: false });
  const remove = useMutation(api.brands.remove);
  const update = useMutation(api.brands.update);
  const ensure = useMutation(api.brands.ensure);

  const [editor, setEditor] = useState<EditorState | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [quickName, setQuickName] = useState("");
  const [quickSaving, setQuickSaving] = useState(false);

  const sorted = useMemo(() => {
    if (!rows) return [];
    return [...rows].sort((a, b) => a.name.localeCompare(b.name) || a.slug.localeCompare(b.slug));
  }, [rows]);

  const counts = useMemo(() => {
    const active = sorted.filter((row) => row.isActive).length;
    return {
      all: sorted.length,
      active,
      hidden: sorted.length - active,
      products: sorted.reduce((sum, row) => sum + row.productCount, 0),
    };
  }, [sorted]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sorted.filter((row) => {
      if (statusFilter === "active" && !row.isActive) return false;
      if (statusFilter === "hidden" && row.isActive) return false;
      if (!q) return true;
      return row.name.toLowerCase().includes(q) || row.slug.includes(q);
    });
  }, [sorted, query, statusFilter]);

  async function quickAdd(event: FormEvent) {
    event.preventDefault();
    if (!canEdit || quickSaving) return;
    const name = quickName.trim();
    if (!name) return;
    setQuickSaving(true);
    try {
      await ensure({ name });
      setQuickName("");
      toast.success(`Added “${name}”.`);
    } catch (caught) {
      toast.error(reportError(caught).message);
    } finally {
      setQuickSaving(false);
    }
  }

  async function toggleActive(row: BrandRow) {
    if (!canEdit) return;
    try {
      await update({ brandId: row._id, isActive: !row.isActive });
      toast.success(row.isActive ? `Hidden “${row.name}”.` : `Shown “${row.name}”.`);
    } catch (caught) {
      toast.error(reportError(caught).message);
    }
  }

  async function onDelete(row: BrandRow) {
    await remove({ brandId: row._id });
    toast.success(`Deleted “${row.name}”.`);
  }

  return (
    <div className="m-0 flex min-h-0 flex-1 flex-col p-0">
      <div className="sticky top-0 z-20 shrink-0 bg-canvas">
        <div className="flex h-14 items-center justify-between gap-3 border-b border-hairline px-4">
          <div className="min-w-0">
            <h2 className="text-xl font-medium tracking-tight text-ink">Brands</h2>
            {rows !== undefined && rows.length > 0 ? (
              <p className="truncate text-xs text-mute">
                {counts.all} brand{counts.all === 1 ? "" : "s"}
                {counts.hidden > 0 ? ` · ${counts.hidden} hidden` : ""}
                {counts.products > 0 ? ` · ${counts.products} products linked` : ""}
              </p>
            ) : null}
          </div>
          {canEdit ? (
            <Button size="sm" onClick={() => setEditor({ mode: "create" })}>
              <Plus />
              Add Brand
            </Button>
          ) : null}
        </div>

        {sorted.length > 0 ? (
          <>
            {canEdit ? (
              <form
                onSubmit={(event) => void quickAdd(event)}
                className="flex flex-col gap-2 border-b border-hairline px-4 py-3 sm:flex-row sm:items-center"
              >
                <Input
                  value={quickName}
                  onChange={(e) => setQuickName(e.target.value)}
                  placeholder="Quick add a brand… e.g. Nike"
                  maxLength={80}
                  className="h-11 flex-1 rounded-none"
                  aria-label="Quick add brand"
                />
                <div className="flex gap-2">
                  <Button type="submit" size="sm" disabled={quickSaving || !quickName.trim()}>
                    <Plus />
                    {quickSaving ? "Adding…" : "Add"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setEditor({ mode: "create" })}
                  >
                    With logo
                  </Button>
                </div>
              </form>
            ) : null}

            <div className="flex flex-col gap-3 border-b border-hairline px-4 py-3 sm:flex-row sm:items-center">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-mute" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search brands…"
                  className="h-11 w-full rounded-none pl-10 text-sm"
                  aria-label="Search brands"
                />
              </div>
              <div className="flex gap-2 overflow-x-auto pb-0.5">
                {(
                  [
                    { id: "all", label: "All", count: counts.all },
                    { id: "active", label: "Active", count: counts.active },
                    { id: "hidden", label: "Hidden", count: counts.hidden },
                  ] as const
                ).map((chip) => {
                  const active = statusFilter === chip.id;
                  return (
                    <button
                      key={chip.id}
                      type="button"
                      onClick={() => setStatusFilter(chip.id)}
                      className={cn(
                        "inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-medium transition active:scale-95 active:opacity-50",
                        active ? "bg-ink text-canvas" : "bg-canvas text-ink ring-1 ring-inset ring-hairline",
                      )}
                    >
                      {chip.label}
                      <span className={cn("tabular-nums text-xs", active ? "text-canvas/70" : "text-mute")}>
                        {chip.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        ) : null}
      </div>

      {rows === undefined ? (
        <div className="min-h-0 flex-1 animate-pulse bg-soft-cloud" />
      ) : sorted.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-4">
          <EmptyState
            icon={Tag}
            title="Add the labels you sell"
            description="Create Nike, Louis Philippe, or your private label. Products link to one brand so filters stay clean."
            action={
              canEdit ? (
                <Button onClick={() => setEditor({ mode: "create" })}>Add Brand</Button>
              ) : undefined
            }
          />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-4">
          <EmptyState
            icon={Search}
            title="No brands match"
            description="Try another search, or switch the Active / Hidden filter."
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  setQuery("");
                  setStatusFilter("all");
                }}
              >
                Clear filters
              </Button>
            }
          />
        </div>
      ) : (
        <ul className="divide-y divide-hairline">
          {filtered.map((row) => (
            <li key={row._id}>
              <div
                className={cn(
                  "group flex items-center gap-3 px-4 py-3 transition hover:bg-soft-cloud/60",
                  !row.isActive && "opacity-70",
                )}
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  onClick={() => (canEdit ? setEditor({ mode: "edit", row }) : undefined)}
                  disabled={!canEdit}
                >
                  <BrandMark name={row.name} logoUrl={row.logoUrl} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium text-ink">{row.name}</p>
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
                          row.isActive
                            ? "bg-soft-cloud text-ink"
                            : "bg-canvas text-mute ring-1 ring-inset ring-hairline",
                        )}
                      >
                        {row.isActive ? "Active" : "Hidden"}
                      </span>
                    </div>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-mute">
                      <span className="font-mono">{row.slug}</span>
                      <span aria-hidden>·</span>
                      <span className="inline-flex items-center gap-1">
                        <Package className="size-3" aria-hidden />
                        {row.productCount === 0
                          ? "No products yet"
                          : `${row.productCount} product${row.productCount === 1 ? "" : "s"}`}
                      </span>
                    </p>
                  </div>
                </button>

                {canEdit ? (
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={row.isActive ? "Hide brand" : "Show brand"}
                      title={row.isActive ? "Hide" : "Show"}
                      onClick={() => void toggleActive(row)}
                    >
                      {row.isActive ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Edit brand"
                      title="Edit"
                      onClick={() => setEditor({ mode: "edit", row })}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <ConfirmDialog
                      trigger={
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Delete brand"
                          title={
                            row.productCount > 0
                              ? "Reassign products before deleting"
                              : "Delete"
                          }
                          disabled={row.productCount > 0}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      }
                      title={`Delete “${row.name}”?`}
                      description={
                        row.productCount > 0
                          ? "Reassign products on this brand before removing it."
                          : "This brand will be removed from your store."
                      }
                      confirmLabel="Delete"
                      destructive
                      onConfirm={async () => {
                        await onDelete(row);
                      }}
                    />
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {editor && canEdit ? (
        <BrandDialog state={editor} onClose={() => setEditor(null)} />
      ) : null}
    </div>
  );
}

function BrandDialog({ state, onClose }: { state: EditorState; onClose: () => void }) {
  const create = useMutation(api.brands.create);
  const update = useMutation(api.brands.update);
  const { upload, isUploading } = useUpload("brand");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editing = state.mode === "edit" ? state.row : null;
  const [name, setName] = useState(editing?.name ?? "");
  const [slug, setSlug] = useState(editing?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(editing));
  const [isActive, setIsActive] = useState(editing?.isActive ?? true);
  const [logoStorageId, setLogoStorageId] = useState<Id<"_storage"> | null>(
    editing?.logoStorageId ?? null,
  );
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(editing?.logoUrl ?? null);
  const [logoCleared, setLogoCleared] = useState(false);
  const [pending, setPending] = useState(false);

  const previewSlug = slugTouched ? brandSlug(slug) : brandSlug(name);

  useEffect(() => {
    return () => {
      if (logoPreviewUrl?.startsWith("blob:")) URL.revokeObjectURL(logoPreviewUrl);
    };
  }, [logoPreviewUrl]);

  async function onPickImage(file: File | undefined) {
    if (!file) return;
    if (!IMAGE_TYPES.has(file.type)) {
      toast.error("Use a JPEG, PNG, or WebP image.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error("Image must be 5 MB or smaller.");
      return;
    }
    const preview = URL.createObjectURL(file);
    setLogoPreviewUrl((current) => {
      if (current?.startsWith("blob:")) URL.revokeObjectURL(current);
      return preview;
    });
    try {
      const storageId = await upload(file, `brand-${file.name}`);
      setLogoStorageId(storageId);
      setLogoCleared(false);
    } catch (error) {
      toast.error(reportError(error).message);
      setLogoPreviewUrl((current) => {
        if (current?.startsWith("blob:")) URL.revokeObjectURL(current);
        return editing?.logoUrl ?? null;
      });
      setLogoStorageId(editing?.logoStorageId ?? null);
    }
  }

  function clearLogo() {
    setLogoPreviewUrl((current) => {
      if (current?.startsWith("blob:")) URL.revokeObjectURL(current);
      return null;
    });
    setLogoStorageId(null);
    setLogoCleared(true);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (pending || isUploading) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    setPending(true);
    try {
      if (editing) {
        await update({
          brandId: editing._id,
          name: trimmed,
          slug: slugTouched ? previewSlug || undefined : undefined,
          isActive,
          logoStorageId: logoCleared ? null : (logoStorageId ?? undefined),
        });
        toast.success("Brand updated.");
      } else {
        await create({
          name: trimmed,
          slug: slugTouched ? previewSlug || undefined : undefined,
          isActive,
          logoStorageId: logoStorageId ?? undefined,
        });
        toast.success("Brand created.");
      }
      onClose();
    } catch (error) {
      toast.error(reportError(error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit brand" : "Add brand"}</DialogTitle>
        </DialogHeader>
        <form className="space-y-5" onSubmit={(event) => void onSubmit(event)}>
          <div className="space-y-2">
            <button
              type="button"
              disabled={isUploading || pending}
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full items-center gap-4 border border-dashed border-hairline bg-soft-cloud/40 px-4 py-4 text-left transition hover:bg-soft-cloud disabled:opacity-50"
            >
              <BrandMark name={name || "Brand"} logoUrl={logoPreviewUrl} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">
                  {isUploading ? "Uploading…" : logoPreviewUrl ? "Replace logo" : "Add logo"}
                </p>
                <p className="mt-0.5 text-xs text-mute">JPEG, PNG or WebP · up to 5 MB · optional</p>
              </div>
              <ImagePlus className="size-5 shrink-0 text-mute" aria-hidden />
            </button>
            {logoPreviewUrl ? (
              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs font-medium text-mute underline-offset-2 hover:text-ink hover:underline"
                onClick={clearLogo}
              >
                <X className="size-3" />
                Remove logo
              </button>
            ) : null}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(event) => {
                void onPickImage(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </div>

          <Field label="Name">
            <Input
              required
              autoFocus={!editing}
              maxLength={80}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Nike"
            />
          </Field>

          <Field
            label="Slug"
            hint="Used so Nike and nike stay one brand. Auto-fills from the name."
          >
            <Input
              maxLength={60}
              value={slugTouched ? slug : previewSlug}
              onChange={(event) => {
                setSlugTouched(true);
                setSlug(event.target.value);
              }}
              placeholder="nike"
              className="font-mono text-sm"
            />
          </Field>

          <label className="flex cursor-pointer items-start gap-3 rounded-none border border-hairline px-3 py-3">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(event) => setIsActive(event.target.checked)}
              className="mt-0.5 size-4 accent-ink"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-ink">Show in product picker</span>
              <span className="mt-0.5 block text-xs text-mute">
                Hidden brands stay on existing products but won’t appear when adding new ones.
              </span>
            </span>
          </label>

          {editing && editing.productCount > 0 ? (
            <p className="text-xs text-mute">
              Linked to {editing.productCount} product{editing.productCount === 1 ? "" : "s"}. Renaming
              updates the name on those products.
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || isUploading || !name.trim()}>
              {pending ? "Saving…" : editing ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
