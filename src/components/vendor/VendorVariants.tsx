"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Eye, EyeOff, Layers, MoreHorizontal, Pencil, Plus, Search, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/vendor/VendorProfileForm";
import { useVendor } from "@/components/vendor/VendorDesk";
import { reportError } from "@/lib/client-errors";
import { cn } from "@/lib/cn";

type Catalog = FunctionReturnType<typeof api.variants.catalog>;
type CatalogType = Catalog[number];
type CatalogOption = CatalogType["options"][number];

type TypeEditor =
  | { mode: "create" }
  | { mode: "edit"; type: CatalogType };

type OptionEditor =
  | { mode: "create"; variantTypeId: Id<"variantTypes"> }
  | { mode: "edit"; option: CatalogOption };

export function VendorVariants() {
  const me = useVendor();
  const canEdit =
    me.vendor.status !== "suspended" &&
    me.vendor.status !== "closed" &&
    (me.membership.role === "owner" || me.membership.role === "manager");

  const catalog = useQuery(api.variants.catalog, { activeOnly: false });
  const seedDefaults = useMutation(api.variants.seedDefaults);
  const createType = useMutation(api.variants.createType);
  const updateType = useMutation(api.variants.updateType);
  const createOption = useMutation(api.variants.createOption);
  const updateOption = useMutation(api.variants.updateOption);

  const [selectedTypeId, setSelectedTypeId] = useState<Id<"variantTypes"> | null>(null);
  const [typeEditor, setTypeEditor] = useState<TypeEditor | null>(null);
  const [optionEditor, setOptionEditor] = useState<OptionEditor | null>(null);
  const [filter, setFilter] = useState("");
  const [quickLabel, setQuickLabel] = useState("");
  const [quickSaving, setQuickSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);

  const sortedCatalog = useMemo(() => {
    if (!catalog) return [];
    return [...catalog].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label),
    );
  }, [catalog]);

  useEffect(() => {
    if (!sortedCatalog.length) return;
    if (selectedTypeId && sortedCatalog.some((row) => row.id === selectedTypeId)) return;
    setSelectedTypeId(sortedCatalog[0].id);
  }, [sortedCatalog, selectedTypeId]);

  const selected = useMemo(
    () => sortedCatalog.find((row) => row.id === selectedTypeId) ?? null,
    [sortedCatalog, selectedTypeId],
  );

  const filteredOptions = useMemo(() => {
    if (!selected) return [];
    const q = filter.trim().toLowerCase();
    const rows = [...selected.options].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label),
    );
    if (!q) return rows;
    return rows.filter(
      (option) =>
        option.label.toLowerCase().includes(q) || option.value.toLowerCase().includes(q),
    );
  }, [selected, filter]);

  const activeOptionCount = selected?.options.filter((o) => o.isActive).length ?? 0;
  const hasSizeColour =
    sortedCatalog.some((t) => t.slug === "size") && sortedCatalog.some((t) => t.slug === "colour");

  async function onSeed() {
    if (seeding || !canEdit) return;
    setSeeding(true);
    setToolsOpen(false);
    try {
      const result = await seedDefaults({});
      toast.success(`Ready: ${result.types} types · ${result.options} options.`);
    } catch (caught) {
      toast.error(reportError(caught).message);
    } finally {
      setSeeding(false);
    }
  }

  async function quickAddOption(event: FormEvent) {
    event.preventDefault();
    if (!canEdit || !selected || quickSaving) return;
    const label = quickLabel.trim();
    if (!label) return;
    setQuickSaving(true);
    try {
      await createOption({
        variantTypeId: selected.id,
        label,
        sortOrder: selected.options.length,
      });
      setQuickLabel("");
      toast.success(`Added “${label}”.`);
    } catch (caught) {
      toast.error(reportError(caught).message);
    } finally {
      setQuickSaving(false);
    }
  }

  async function toggleOptionActive(option: CatalogOption) {
    if (!canEdit) return;
    try {
      await updateOption({
        variantOptionId: option.id,
        isActive: !option.isActive,
      });
      toast.success(option.isActive ? `Hidden “${option.label}”.` : `Shown “${option.label}”.`);
    } catch (caught) {
      toast.error(reportError(caught).message);
    }
  }

  async function toggleTypeActive() {
    if (!canEdit || !selected) return;
    try {
      await updateType({
        variantTypeId: selected.id,
        isActive: !selected.isActive,
      });
      toast.success(selected.isActive ? `Hidden ${selected.label}.` : `Shown ${selected.label}.`);
    } catch (caught) {
      toast.error(reportError(caught).message);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="sticky top-0 z-20 shrink-0 bg-canvas">
        <div className="flex h-14 items-center justify-between gap-3 border-b border-hairline px-4">
          <div className="min-w-0">
            <h2 className="text-xl font-medium tracking-tight text-ink">Variants</h2>
          </div>
          {canEdit ? (
            <div className="flex items-center gap-2">
              <div className="relative">
                <Button
                  type="button"
                  variant="secondary"
                  size="icon-sm"
                  aria-label="More tools"
                  aria-expanded={toolsOpen}
                  onClick={() => setToolsOpen((open) => !open)}
                >
                  <MoreHorizontal className="size-4" />
                </Button>
                {toolsOpen ? (
                  <>
                    <button
                      type="button"
                      className="fixed inset-0 z-10 cursor-default"
                      aria-label="Close menu"
                      onClick={() => setToolsOpen(false)}
                    />
                    <div className="absolute right-0 z-20 mt-2 w-56 border border-hairline bg-canvas py-1 shadow-none">
                      <button
                        type="button"
                        disabled={seeding}
                        onClick={() => void onSeed()}
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-soft-cloud disabled:opacity-40"
                      >
                        <Sparkles className="size-4 shrink-0" aria-hidden />
                        {seeding ? "Seeding…" : hasSizeColour ? "Refresh Size + Colour" : "Seed Size + Colour"}
                      </button>
                    </div>
                  </>
                ) : null}
              </div>
              <Button type="button" size="sm" onClick={() => setTypeEditor({ mode: "create" })}>
                <Plus />
                Add type
              </Button>
            </div>
          ) : null}
        </div>

        {sortedCatalog.length > 0 ? (
          <div className="border-b border-hairline px-4 py-3">
            <div className="flex gap-2 overflow-x-auto pb-0.5">
              {sortedCatalog.map((type) => {
                const active = type.id === selectedTypeId;
                return (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => {
                      setSelectedTypeId(type.id);
                      setFilter("");
                      setQuickLabel("");
                    }}
                    className={cn(
                      "inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-medium transition active:scale-95 active:opacity-50",
                      active ? "bg-ink text-canvas" : "bg-canvas text-ink ring-1 ring-inset ring-hairline",
                      !type.isActive && !active && "text-mute",
                    )}
                  >
                    {type.label}
                    {!type.isActive ? (
                      <span className={cn("text-xs", active ? "text-canvas/70" : "text-mute")}>Hidden</span>
                    ) : null}
                    <span className={cn("tabular-nums text-xs", active ? "text-canvas/70" : "text-mute")}>
                      {type.options.length}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      {catalog === undefined ? (
        <div className="min-h-0 flex-1 animate-pulse bg-soft-cloud" />
      ) : sortedCatalog.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-4">
          <EmptyState
            icon={Layers}
            title="Set up your options"
            description="Start with Size and Colour, or create a custom type like Fit."
            action={
              canEdit ? (
                <div className="flex flex-wrap justify-center gap-2">
                  <Button onClick={() => void onSeed()} disabled={seeding}>
                    <Sparkles />
                    {seeding ? "Seeding…" : "Use Size + Colour"}
                  </Button>
                  <Button variant="secondary" onClick={() => setTypeEditor({ mode: "create" })}>
                    Add custom type
                  </Button>
                </div>
              ) : undefined
            }
          />
        </div>
      ) : selected ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-4 py-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-medium tracking-tight">{selected.label}</h3>
                <span
                  className={cn(
                    "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
                    selected.isActive
                      ? "bg-soft-cloud text-ink"
                      : "bg-canvas text-mute ring-1 ring-inset ring-hairline",
                  )}
                >
                  {selected.isActive ? "Active" : "Hidden"}
                </span>
              </div>
              <p className="mt-0.5 text-sm text-mute">
                {activeOptionCount} active
                {selected.options.length !== activeOptionCount
                  ? ` · ${selected.options.length - activeOptionCount} hidden`
                  : ""}{" "}
                · used when products enable this type
              </p>
            </div>
            {canEdit ? (
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={() => void toggleTypeActive()}>
                  {selected.isActive ? (
                    <>
                      <EyeOff className="size-4" />
                      Hide type
                    </>
                  ) : (
                    <>
                      <Eye className="size-4" />
                      Show type
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setTypeEditor({ mode: "edit", type: selected })}
                >
                  <Pencil className="size-4" />
                  Edit
                </Button>
              </div>
            ) : null}
          </div>

          {canEdit ? (
            <form
              onSubmit={(event) => void quickAddOption(event)}
              className="flex flex-col gap-2 border-b border-hairline px-4 py-3 sm:flex-row sm:items-center"
            >
              <Input
                value={quickLabel}
                onChange={(e) => setQuickLabel(e.target.value)}
                placeholder={`Add a ${selected.label.toLowerCase()}… e.g. ${selected.slug === "size" ? "XXL" : selected.slug === "colour" ? "Olive" : "Relaxed"}`}
                maxLength={40}
                className="h-11 flex-1 rounded-none"
                aria-label={`Quick add ${selected.label} option`}
              />
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={quickSaving || !quickLabel.trim()}>
                  <Plus />
                  {quickSaving ? "Adding…" : "Add"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setOptionEditor({ mode: "create", variantTypeId: selected.id })}
                >
                  More fields
                </Button>
              </div>
            </form>
          ) : null}

          <div className="border-b border-hairline px-4 py-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-mute" />
              <Input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder={`Search ${selected.label.toLowerCase()} options…`}
                className="h-11 w-full rounded-none pl-10 text-sm"
                aria-label="Search options"
              />
            </div>
          </div>

          {selected.options.length === 0 ? (
            <div className="flex min-h-0 flex-1 items-center justify-center px-4">
              <EmptyState
                icon={Layers}
                title={`No ${selected.label.toLowerCase()} values yet`}
                description="Add the values shoppers will choose (S, M, L…)."
              />
            </div>
          ) : filteredOptions.length === 0 ? (
            <div className="flex min-h-0 flex-1 items-center justify-center px-4">
              <EmptyState
                icon={Search}
                title="No matches"
                description="Try a different search, or clear the filter."
                action={
                  <Button variant="secondary" onClick={() => setFilter("")}>
                    Clear search
                  </Button>
                }
              />
            </div>
          ) : (
            <ul className="min-h-0 flex-1 divide-y divide-hairline overflow-y-auto">
              {filteredOptions.map((option) => (
                <li
                  key={option.id}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3",
                    !option.isActive && "bg-soft-cloud/50",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className={cn("truncate text-sm font-medium", !option.isActive && "text-mute")}>
                      {option.label}
                    </p>
                    <p className="truncate font-mono text-xs text-mute">{option.value}</p>
                  </div>
                  <span className="hidden tabular-nums text-xs text-mute sm:inline">
                    #{option.sortOrder}
                  </span>
                  <span
                    className={cn(
                      "inline-flex shrink-0 rounded-full px-2.5 py-1 text-xs font-medium",
                      option.isActive
                        ? "bg-soft-cloud text-ink"
                        : "bg-canvas text-mute ring-1 ring-inset ring-hairline",
                    )}
                  >
                    {option.isActive ? "Active" : "Hidden"}
                  </span>
                  {canEdit ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={option.isActive ? `Hide ${option.label}` : `Show ${option.label}`}
                        title={option.isActive ? "Hide" : "Show"}
                        onClick={() => void toggleOptionActive(option)}
                      >
                        {option.isActive ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Edit ${option.label}`}
                        title="Edit"
                        onClick={() => setOptionEditor({ mode: "edit", option })}
                      >
                        <Pencil className="size-4" />
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {typeEditor ? (
        <TypeDialog
          editor={typeEditor}
          nextSortOrder={sortedCatalog.length}
          onClose={() => setTypeEditor(null)}
          onCreate={async (values) => {
            const id = await createType(values);
            setSelectedTypeId(id);
            toast.success("Type created.");
          }}
          onUpdate={async (values) => {
            await updateType(values);
            toast.success("Type updated.");
          }}
        />
      ) : null}

      {optionEditor ? (
        <OptionDialog
          editor={optionEditor}
          nextSortOrder={selected?.options.length ?? 0}
          typeLabel={selected?.label ?? "option"}
          onClose={() => setOptionEditor(null)}
          onCreate={async (values) => {
            await createOption(values);
            toast.success("Option created.");
          }}
          onUpdate={async (values) => {
            await updateOption(values);
            toast.success("Option updated.");
          }}
        />
      ) : null}
    </div>
  );
}

function TypeDialog({
  editor,
  nextSortOrder,
  onClose,
  onCreate,
  onUpdate,
}: {
  editor: TypeEditor;
  nextSortOrder: number;
  onClose: () => void;
  onCreate: (values: { label: string; slug?: string; sortOrder?: number }) => Promise<void>;
  onUpdate: (values: {
    variantTypeId: Id<"variantTypes">;
    label?: string;
    sortOrder?: number;
    isActive?: boolean;
  }) => Promise<void>;
}) {
  const editing = editor.mode === "edit" ? editor.type : null;
  const [label, setLabel] = useState(editing?.label ?? "");
  const [slug, setSlug] = useState(editing?.slug ?? "");
  const [sortOrder, setSortOrder] = useState(String(editing?.sortOrder ?? nextSortOrder));
  const [isActive, setIsActive] = useState(editing?.isActive ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const order = Number(sortOrder);
      if (editing) {
        await onUpdate({
          variantTypeId: editing.id,
          label: label.trim(),
          sortOrder: Number.isFinite(order) ? Math.round(order) : 0,
          isActive,
        });
      } else {
        await onCreate({
          label: label.trim(),
          slug: slug.trim() || undefined,
          sortOrder: Number.isFinite(order) ? Math.round(order) : undefined,
        });
      }
      onClose();
    } catch (caught) {
      setError(reportError(caught).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent>
        <form onSubmit={(event) => void onSubmit(event)} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit type" : "Add type"}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-mute">
            A type is a dimension shoppers choose — Size, Colour, Fit…
          </p>
          <Field label="Name">
            <Input
              required
              autoFocus
              maxLength={40}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Fit"
            />
          </Field>
          {!editing ? (
            <Field label="Slug" hint="Optional. Used in data exports; auto from name if blank.">
              <Input maxLength={40} value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="fit" />
            </Field>
          ) : null}
          <Field label="Display order" hint="Lower numbers appear first in product editors.">
            <Input
              type="number"
              min={0}
              step={1}
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
            />
          </Field>
          {editing ? (
            <label className="flex items-center gap-3 text-sm font-medium">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="size-5 accent-ink"
              />
              Show in product editors
            </label>
          ) : null}
          {error ? <p className="text-sm text-sale">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !label.trim()}>
              {saving ? "Saving…" : editing ? "Save" : "Create type"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function OptionDialog({
  editor,
  nextSortOrder,
  typeLabel,
  onClose,
  onCreate,
  onUpdate,
}: {
  editor: OptionEditor;
  nextSortOrder: number;
  typeLabel: string;
  onClose: () => void;
  onCreate: (values: {
    variantTypeId: Id<"variantTypes">;
    label: string;
    value?: string;
    sortOrder?: number;
  }) => Promise<void>;
  onUpdate: (values: {
    variantOptionId: Id<"variantOptions">;
    label?: string;
    sortOrder?: number;
    isActive?: boolean;
  }) => Promise<void>;
}) {
  const editing = editor.mode === "edit" ? editor.option : null;
  const [label, setLabel] = useState(editing?.label ?? "");
  const [value, setValue] = useState(editing?.value ?? "");
  const [sortOrder, setSortOrder] = useState(String(editing?.sortOrder ?? nextSortOrder));
  const [isActive, setIsActive] = useState(editing?.isActive ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const order = Number(sortOrder);
      if (editing) {
        await onUpdate({
          variantOptionId: editing.id,
          label: label.trim(),
          sortOrder: Number.isFinite(order) ? Math.round(order) : 0,
          isActive,
        });
      } else if (editor.mode === "create") {
        await onCreate({
          variantTypeId: editor.variantTypeId,
          label: label.trim(),
          value: value.trim() || undefined,
          sortOrder: Number.isFinite(order) ? Math.round(order) : undefined,
        });
      }
      onClose();
    } catch (caught) {
      setError(reportError(caught).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent>
        <form onSubmit={(event) => void onSubmit(event)} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${typeLabel.toLowerCase()}` : `Add ${typeLabel.toLowerCase()}`}</DialogTitle>
          </DialogHeader>
          <Field label="Label">
            <Input
              required
              autoFocus
              maxLength={40}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Relaxed"
            />
          </Field>
          {!editing ? (
            <Field label="Value" hint="Optional machine id. Auto from label if blank.">
              <Input
                maxLength={40}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="relaxed"
              />
            </Field>
          ) : null}
          <Field label="Display order">
            <Input
              type="number"
              min={0}
              step={1}
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
            />
          </Field>
          {editing ? (
            <label className="flex items-center gap-3 text-sm font-medium">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="size-5 accent-ink"
              />
              Selectable on products
            </label>
          ) : null}
          {error ? <p className="text-sm text-sale">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !label.trim()}>
              {saving ? "Saving…" : editing ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
