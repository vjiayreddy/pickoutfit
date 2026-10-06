"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  Eye,
  EyeOff,
  Layers,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Sparkles,
} from "lucide-react";
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

type AttrType = FunctionReturnType<typeof api.attributes.listTypes>[number];
type AttrRow = FunctionReturnType<typeof api.attributes.list>[number];
type CatRow = FunctionReturnType<typeof api.categories.list>[number];

type TypeEditor = { mode: "create" } | { mode: "edit"; type: AttrType };
type AttrEditor =
  | { mode: "create"; attributeTypeId: Id<"attributeTypes"> }
  | { mode: "edit"; row: AttrRow };

export function VendorAttributes() {
  const me = useVendor();
  const canEdit =
    me.vendor.status !== "suspended" &&
    me.vendor.status !== "closed" &&
    (me.membership.role === "owner" || me.membership.role === "manager");

  const types = useQuery(api.attributes.listTypes, { activeOnly: false });
  const categories = useQuery(api.categories.list, { activeOnly: true });
  const seedDefaults = useMutation(api.attributes.seedDefaults);
  const createType = useMutation(api.attributes.createType);
  const updateType = useMutation(api.attributes.updateType);
  const createAttr = useMutation(api.attributes.create);
  const updateAttr = useMutation(api.attributes.update);

  const [selectedTypeId, setSelectedTypeId] = useState<Id<"attributeTypes"> | null>(null);
  const [typeEditor, setTypeEditor] = useState<TypeEditor | null>(null);
  const [attrEditor, setAttrEditor] = useState<AttrEditor | null>(null);
  const [filter, setFilter] = useState("");
  const [quickLabel, setQuickLabel] = useState("");
  const [quickSaving, setQuickSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);

  const sortedTypes = useMemo(() => {
    if (!types) return [];
    return [...types].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label),
    );
  }, [types]);

  useEffect(() => {
    if (!sortedTypes.length) return;
    if (selectedTypeId && sortedTypes.some((row) => row._id === selectedTypeId)) return;
    setSelectedTypeId(sortedTypes[0]._id);
  }, [sortedTypes, selectedTypeId]);

  const selected = useMemo(
    () => sortedTypes.find((row) => row._id === selectedTypeId) ?? null,
    [sortedTypes, selectedTypeId],
  );

  const attrs = useQuery(
    api.attributes.list,
    selectedTypeId ? { attributeTypeId: selectedTypeId, activeOnly: false } : "skip",
  );

  const filteredAttrs = useMemo(() => {
    if (!attrs) return [];
    const q = filter.trim().toLowerCase();
    const rows = [...attrs].sort((a, b) => a.label.localeCompare(b.label));
    if (!q) return rows;
    return rows.filter(
      (row) =>
        row.label.toLowerCase().includes(q) ||
        row.value.toLowerCase().includes(q),
    );
  }, [attrs, filter]);

  const hasSizeColour =
    sortedTypes.some((t) => t.slug === "size") && sortedTypes.some((t) => t.slug === "colour");

  async function onSeed() {
    if (seeding || !canEdit) return;
    setSeeding(true);
    setToolsOpen(false);
    try {
      const result = await seedDefaults({});
      toast.success(`Ready: ${result.types} types · ${result.attributes} attributes.`);
    } catch (caught) {
      toast.error(reportError(caught).message);
    } finally {
      setSeeding(false);
    }
  }

  async function quickAdd(event: FormEvent) {
    event.preventDefault();
    if (!canEdit || !selected || quickSaving) return;
    const label = quickLabel.trim();
    if (!label) return;
    setQuickSaving(true);
    try {
      await createAttr({ attributeTypeId: selected._id, label });
      setQuickLabel("");
      toast.success(`Added “${label}”.`);
    } catch (caught) {
      toast.error(reportError(caught).message);
    } finally {
      setQuickSaving(false);
    }
  }

  async function toggleAttrActive(row: AttrRow) {
    if (!canEdit) return;
    try {
      await updateAttr({ attributeId: row._id, isActive: !row.isActive });
      toast.success(row.isActive ? `Hidden “${row.label}”.` : `Shown “${row.label}”.`);
    } catch (caught) {
      toast.error(reportError(caught).message);
    }
  }

  async function toggleTypeActive() {
    if (!canEdit || !selected) return;
    try {
      await updateType({ attributeTypeId: selected._id, isActive: !selected.isActive });
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
            <h2 className="text-xl font-medium tracking-tight text-ink">Attributes</h2>
            <p className="truncate text-xs text-mute">
              Fashion vocabulary used by filters and variant recipes.
            </p>
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
                    <div className="absolute right-0 z-20 mt-2 w-56 border border-hairline bg-canvas py-1">
                      <button
                        type="button"
                        disabled={seeding}
                        onClick={() => void onSeed()}
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-soft-cloud disabled:opacity-40"
                      >
                        <Sparkles className="size-4 shrink-0" aria-hidden />
                        {seeding
                          ? "Seeding…"
                          : hasSizeColour
                            ? "Refresh Size + Colour"
                            : "Seed Size + Colour"}
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

        {sortedTypes.length > 0 ? (
          <div className="flex gap-2 overflow-x-auto border-b border-hairline px-4 py-2">
            {sortedTypes.map((type) => (
              <button
                key={type._id}
                type="button"
                onClick={() => setSelectedTypeId(type._id)}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1.5 text-sm font-medium",
                  selectedTypeId === type._id
                    ? "bg-ink text-on-primary"
                    : "bg-soft-cloud text-ink",
                  !type.isActive && "opacity-50",
                )}
              >
                {type.displayLabel || type.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {!types ? (
        <div className="p-6 text-sm text-mute">Loading…</div>
      ) : sortedTypes.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No attribute types yet"
          description="Seed Size + Colour, or add your own types like Fabric and Fit."
          action={
            canEdit ? (
              <Button type="button" onClick={() => void onSeed()} disabled={seeding}>
                <Sparkles />
                {seeding ? "Seeding…" : "Seed Size + Colour"}
              </Button>
            ) : undefined
          }
        />
      ) : selected ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-4 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-medium text-ink">
                  {selected.displayLabel || selected.label}
                </h3>
                {!selected.isActive ? (
                  <span className="text-xs text-mute">Hidden</span>
                ) : null}
              </div>
              <p className="text-xs text-mute">slug: {selected.slug}</p>
            </div>
            {canEdit ? (
              <div className="flex items-center gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={() => void toggleTypeActive()}>
                  {selected.isActive ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  {selected.isActive ? "Hide type" : "Show type"}
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

          <div className="flex flex-wrap items-center gap-2 border-b border-hairline px-4 py-2">
            <div className="relative min-w-[12rem] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-mute" />
              <Input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter values"
                className="pl-9"
              />
            </div>
            {canEdit ? (
              <form onSubmit={quickAdd} className="flex gap-2">
                <Input
                  value={quickLabel}
                  onChange={(e) => setQuickLabel(e.target.value)}
                  placeholder="Quick add value"
                  className="w-40"
                />
                <Button type="submit" size="sm" disabled={quickSaving || !quickLabel.trim()}>
                  Add
                </Button>
              </form>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {!attrs ? (
              <div className="p-6 text-sm text-mute">Loading values…</div>
            ) : filteredAttrs.length === 0 ? (
              <div className="p-6 text-sm text-mute">No values yet.</div>
            ) : (
              <ul className="divide-y divide-hairline">
                {filteredAttrs.map((row) => (
                  <li key={row._id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className={cn("font-medium text-ink", !row.isActive && "opacity-50")}>
                        {row.label}
                      </p>
                      <p className="text-xs text-mute">
                        {row.value}
                        {row.categoryIds.length > 0
                          ? ` · ${row.categoryIds.length} categor${row.categoryIds.length === 1 ? "y" : "ies"}`
                          : " · all categories"}
                      </p>
                    </div>
                    {canEdit ? (
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => void toggleAttrActive(row)}
                          aria-label={row.isActive ? "Hide" : "Show"}
                        >
                          {row.isActive ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setAttrEditor({ mode: "edit", row })}
                          aria-label="Edit"
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
        </div>
      ) : null}

      {typeEditor ? (
        <TypeDialog
          editor={typeEditor}
          canEdit={canEdit}
          onClose={() => setTypeEditor(null)}
          onCreate={async (values) => {
            const id = await createType(values);
            setSelectedTypeId(id);
            setTypeEditor(null);
            toast.success("Attribute type created.");
          }}
          onUpdate={async (values) => {
            if (typeEditor.mode !== "edit") return;
            await updateType({ attributeTypeId: typeEditor.type._id, ...values });
            setTypeEditor(null);
            toast.success("Attribute type updated.");
          }}
        />
      ) : null}

      {attrEditor && selected ? (
        <AttrDialog
          editor={attrEditor}
          categories={categories ?? []}
          canEdit={canEdit}
          onClose={() => setAttrEditor(null)}
          onCreate={async (values) => {
            await createAttr({ attributeTypeId: selected._id, ...values });
            setAttrEditor(null);
            toast.success("Attribute created.");
          }}
          onUpdate={async (values) => {
            if (attrEditor.mode !== "edit") return;
            await updateAttr({ attributeId: attrEditor.row._id, ...values });
            setAttrEditor(null);
            toast.success("Attribute updated.");
          }}
        />
      ) : null}
    </div>
  );
}

function TypeDialog({
  editor,
  canEdit,
  onClose,
  onCreate,
  onUpdate,
}: {
  editor: TypeEditor;
  canEdit: boolean;
  onClose: () => void;
  onCreate: (values: { label: string; displayLabel?: string; isEnableFilter?: boolean }) => Promise<void>;
  onUpdate: (values: {
    label?: string;
    displayLabel?: string;
    isEnableFilter?: boolean;
  }) => Promise<void>;
}) {
  const existing = editor.mode === "edit" ? editor.type : null;
  const [label, setLabel] = useState(existing?.label ?? "");
  const [displayLabel, setDisplayLabel] = useState(existing?.displayLabel ?? "");
  const [isEnableFilter, setIsEnableFilter] = useState(existing?.isEnableFilter ?? true);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canEdit || saving) return;
    setSaving(true);
    try {
      if (editor.mode === "create") {
        await onCreate({
          label: label.trim(),
          displayLabel: displayLabel.trim() || undefined,
          isEnableFilter,
        });
      } else {
        await onUpdate({
          label: label.trim(),
          displayLabel: displayLabel.trim(),
          isEnableFilter,
        });
      }
    } catch (caught) {
      toast.error(reportError(caught).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {editor.mode === "create" ? "Add attribute type" : "Edit attribute type"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
          <Field label="Label">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} required maxLength={40} />
          </Field>
          <Field label="Display label">
            <Input
              value={displayLabel}
              onChange={(e) => setDisplayLabel(e.target.value)}
              placeholder={label || "Shown in filters"}
              maxLength={60}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={isEnableFilter}
              onChange={(e) => setIsEnableFilter(e.target.checked)}
            />
            Enable as storefront filter
          </label>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canEdit || saving || !label.trim()}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AttrDialog({
  editor,
  categories,
  canEdit,
  onClose,
  onCreate,
  onUpdate,
}: {
  editor: AttrEditor;
  categories: CatRow[];
  canEdit: boolean;
  onClose: () => void;
  onCreate: (values: {
    label: string;
    categoryIds?: Id<"categories">[];
  }) => Promise<void>;
  onUpdate: (values: {
    label?: string;
    categoryIds?: Id<"categories">[];
  }) => Promise<void>;
}) {
  const existing = editor.mode === "edit" ? editor.row : null;
  const [label, setLabel] = useState(existing?.label ?? "");
  const [categoryIds, setCategoryIds] = useState<Id<"categories">[]>(existing?.categoryIds ?? []);
  const [saving, setSaving] = useState(false);

  function toggleCategory(id: Id<"categories">) {
    setCategoryIds((prev) =>
      prev.includes(id) ? prev.filter((row) => row !== id) : [...prev, id],
    );
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canEdit || saving) return;
    setSaving(true);
    try {
      if (editor.mode === "create") {
        await onCreate({ label: label.trim(), categoryIds });
      } else {
        await onUpdate({ label: label.trim(), categoryIds });
      }
    } catch (caught) {
      toast.error(reportError(caught).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editor.mode === "create" ? "Add attribute" : "Edit attribute"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
          <Field label="Label">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} required maxLength={60} />
          </Field>
          <Field label="Categories (optional — empty means all)">
            <div className="max-h-48 space-y-1 overflow-y-auto border border-hairline p-2">
              {categories.length === 0 ? (
                <p className="text-xs text-mute">No categories yet.</p>
              ) : (
                categories.map((cat) => (
                  <label key={cat._id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={categoryIds.includes(cat._id)}
                      onChange={() => toggleCategory(cat._id)}
                    />
                    <span className="truncate">{cat.path || cat.name}</span>
                  </label>
                ))
              )}
            </div>
          </Field>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canEdit || saving || !label.trim()}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
