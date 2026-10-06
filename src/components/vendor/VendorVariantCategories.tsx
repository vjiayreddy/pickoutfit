"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { GitBranch, Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/vendor/VendorProfileForm";
import { useVendor } from "@/components/vendor/VendorDesk";
import { reportError } from "@/lib/client-errors";
import { cn } from "@/lib/cn";
import { routes } from "@/lib/routes";

type Recipe = FunctionReturnType<typeof api.variantCategories.list>[number];
type AttrType = FunctionReturnType<typeof api.attributes.listTypes>[number];
type AttrRow = FunctionReturnType<typeof api.attributes.list>[number];
type CatRow = FunctionReturnType<typeof api.categories.list>[number];

type Editor =
  | { mode: "create" }
  | { mode: "edit"; row: Recipe };

export function VendorVariantCategories() {
  const me = useVendor();
  const canEdit =
    me.vendor.status !== "suspended" &&
    me.vendor.status !== "closed" &&
    (me.membership.role === "owner" || me.membership.role === "manager");

  const recipes = useQuery(api.variantCategories.list, {});
  const attributeTypes = useQuery(api.attributes.listTypes, { activeOnly: true });
  const categories = useQuery(api.categories.list, { activeOnly: true });
  const upsert = useMutation(api.variantCategories.upsert);
  const remove = useMutation(api.variantCategories.remove);

  const [editor, setEditor] = useState<Editor | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Recipe | null>(null);
  const [deleting, setDeleting] = useState(false);

  const sorted = useMemo(() => {
    if (!recipes) return [];
    return [...recipes].sort((a, b) => a.title.localeCompare(b.title));
  }, [recipes]);

  async function onConfirmDelete() {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    try {
      await remove({ variantCategoryId: pendingDelete._id });
      toast.success(`Deleted “${pendingDelete.title}”.`);
      setPendingDelete(null);
    } catch (caught) {
      toast.error(reportError(caught).message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="sticky top-0 z-20 shrink-0 bg-canvas">
        <div className="flex h-14 items-center justify-between gap-3 border-b border-hairline px-4">
          <div className="min-w-0">
            <h2 className="text-xl font-medium tracking-tight text-ink">Variant recipes</h2>
            <p className="truncate text-xs text-mute">
              Pick attributes + categories → syncs Size/Colour dimensions for products.
            </p>
          </div>
          {canEdit ? (
            <Button type="button" size="sm" onClick={() => setEditor({ mode: "create" })}>
              <Plus />
              Add recipe
            </Button>
          ) : null}
        </div>
      </div>

      {!recipes ? (
        <div className="p-6 text-sm text-mute">Loading…</div>
      ) : sorted.length === 0 ? (
        <EmptyState
          icon={GitBranch}
          title="No variant recipes yet"
          description="Create a recipe from your attribute catalog (e.g. Men Size → S/M/L). It syncs a variant type products can enable."
          action={
            canEdit ? (
              <div className="flex flex-wrap gap-2">
                <Button href={routes.vendorAttributes} variant="secondary">
                  Manage attributes
                </Button>
                <Button type="button" onClick={() => setEditor({ mode: "create" })}>
                  <Plus />
                  Add recipe
                </Button>
              </div>
            ) : undefined
          }
        />
      ) : (
        <ul className="divide-y divide-hairline">
          {sorted.map((row) => (
            <li key={row._id} className="flex items-start justify-between gap-3 px-4 py-4">
              <div className="min-w-0">
                <p className="font-medium text-ink">{row.title}</p>
                <p className="mt-1 text-xs text-mute">
                  {row.attributeTypeLabel} · {row.attributeIds.length} options ·{" "}
                  {row.categoryIds.length} categor{row.categoryIds.length === 1 ? "y" : "ies"}
                  {row.variantTypeId ? ` · synced (${row.optionCount} SKU values)` : " · not synced"}
                </p>
              </div>
              {canEdit ? (
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setEditor({ mode: "edit", row })}
                    aria-label="Edit"
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setPendingDelete(row)}
                    aria-label="Delete"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {editor ? (
        <RecipeDialog
          editor={editor}
          attributeTypes={attributeTypes ?? []}
          categories={categories ?? []}
          canEdit={canEdit}
          onClose={() => setEditor(null)}
          onSave={async (values) => {
            await upsert({
              variantCategoryId: editor.mode === "edit" ? editor.row._id : undefined,
              ...values,
            });
            setEditor(null);
            toast.success(editor.mode === "create" ? "Recipe created & synced." : "Recipe updated & synced.");
          }}
        />
      ) : null}

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Delete variant recipe?"
        description={
          pendingDelete
            ? `This removes “${pendingDelete.title}” and its synced variant type (if unused by products).`
            : undefined
        }
        confirmLabel="Delete"
        destructive
        confirmDisabled={deleting}
        onConfirm={onConfirmDelete}
      />
    </div>
  );
}

function RecipeDialog({
  editor,
  attributeTypes,
  categories,
  canEdit,
  onClose,
  onSave,
}: {
  editor: Editor;
  attributeTypes: AttrType[];
  categories: CatRow[];
  canEdit: boolean;
  onClose: () => void;
  onSave: (values: {
    title: string;
    attributeTypeId: Id<"attributeTypes">;
    categoryIds: Id<"categories">[];
    attributeIds: Id<"attributes">[];
  }) => Promise<void>;
}) {
  const existing = editor.mode === "edit" ? editor.row : null;
  const [title, setTitle] = useState(existing?.title ?? "");
  const [attributeTypeId, setAttributeTypeId] = useState<Id<"attributeTypes"> | "">(
    existing?.attributeTypeId ?? "",
  );
  const [categoryIds, setCategoryIds] = useState<Id<"categories">[]>(existing?.categoryIds ?? []);
  const [attributeIds, setAttributeIds] = useState<Id<"attributes">[]>(existing?.attributeIds ?? []);
  const [saving, setSaving] = useState(false);

  const attrs = useQuery(
    api.attributes.list,
    attributeTypeId
      ? { attributeTypeId: attributeTypeId as Id<"attributeTypes">, activeOnly: true }
      : "skip",
  );

  const filteredAttrs = useMemo(() => {
    if (!attrs) return [];
    if (categoryIds.length === 0) return attrs;
    return attrs.filter(
      (row) =>
        row.categoryIds.length === 0 ||
        row.categoryIds.some((id) => categoryIds.includes(id)),
    );
  }, [attrs, categoryIds]);

  function toggleId<T extends string>(list: T[], id: T, set: (next: T[]) => void) {
    set(list.includes(id) ? list.filter((row) => row !== id) : [...list, id]);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canEdit || saving || !attributeTypeId) return;
    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        attributeTypeId: attributeTypeId as Id<"attributeTypes">,
        categoryIds,
        attributeIds,
      });
    } catch (caught) {
      toast.error(reportError(caught).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editor.mode === "create" ? "Add variant recipe" : "Edit variant recipe"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
          <Field label="Title">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Men Size"
              required
              maxLength={60}
            />
          </Field>

          <Field label="Attribute type">
            <select
              className="h-10 w-full rounded-none border border-hairline bg-canvas px-3 text-sm"
              value={attributeTypeId}
              onChange={(e) => {
                setAttributeTypeId(e.target.value as Id<"attributeTypes"> | "");
                setAttributeIds([]);
              }}
              required
            >
              <option value="">Select type…</option>
              {attributeTypes.map((type) => (
                <option key={type._id} value={type._id}>
                  {type.displayLabel || type.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Categories">
            <div className="max-h-40 space-y-1 overflow-y-auto border border-hairline p-2">
              {categories.length === 0 ? (
                <p className="text-xs text-mute">Add categories first.</p>
              ) : (
                categories.map((cat) => (
                  <label key={cat._id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={categoryIds.includes(cat._id)}
                      onChange={() => toggleId(categoryIds, cat._id, setCategoryIds)}
                    />
                    <span className="truncate">{cat.path || cat.name}</span>
                  </label>
                ))
              )}
            </div>
          </Field>

          <Field label="Attribute options">
            {!attributeTypeId ? (
              <p className="text-xs text-mute">Pick an attribute type first.</p>
            ) : !attrs ? (
              <p className="text-xs text-mute">Loading options…</p>
            ) : filteredAttrs.length === 0 ? (
              <p className="text-xs text-mute">
                No attributes for this type/categories.{" "}
                <a href={routes.vendorAttributes} className="underline">
                  Add some
                </a>
                .
              </p>
            ) : (
              <div className="max-h-48 space-y-1 overflow-y-auto border border-hairline p-2">
                {filteredAttrs.map((row: AttrRow) => (
                  <label
                    key={row._id}
                    className={cn("flex items-center gap-2 text-sm", !row.isActive && "opacity-50")}
                  >
                    <input
                      type="checkbox"
                      checked={attributeIds.includes(row._id)}
                      onChange={() => toggleId(attributeIds, row._id, setAttributeIds)}
                    />
                    <span className="truncate">{row.label}</span>
                  </label>
                ))}
              </div>
            )}
          </Field>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                !canEdit ||
                saving ||
                !title.trim() ||
                !attributeTypeId ||
                categoryIds.length === 0 ||
                attributeIds.length === 0
              }
            >
              {saving ? "Saving…" : "Save & sync"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
