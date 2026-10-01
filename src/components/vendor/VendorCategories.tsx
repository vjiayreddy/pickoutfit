"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import type {
  ColDef,
  ICellRendererParams,
  ValueFormatterParams,
  ValueGetterParams,
} from "ag-grid-community";
import type { AgGridReact } from "ag-grid-react";
import { FolderPlus, FolderTree, ImagePlus, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { VendorDataGrid } from "@/components/ui/VendorDataGrid";
import { Field } from "@/components/vendor/VendorProfileForm";
import { useVendor } from "@/components/vendor/VendorDesk";
import { useUpload } from "@/hooks/use-upload";
import { reportError } from "@/lib/client-errors";
import { cn } from "@/lib/cn";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

type CategoryRow = FunctionReturnType<typeof api.categories.list>[number];

type CategoryGridRow = CategoryRow & { hierarchyLabel: string };

type EditorState =
  | { mode: "create"; parentId?: Id<"categories"> }
  | { mode: "edit"; row: CategoryRow };

type CategoryGridContext = {
  canEdit: boolean;
  /** Bumps when any row image changes so NameCell re-renders under reactiveCustomComponents. */
  imageRevision: string;
  onAddChild: (row: CategoryRow) => void;
  onEdit: (row: CategoryRow) => void;
  onDelete: (row: CategoryRow) => Promise<void>;
};

/** e.g. Clothes · Men(Clothes) · Accessories(Men) · Eyewear(Men->Accessories) */
function formatHierarchyLabel(row: CategoryRow, pathToName: Map<string, string>): string {
  if (row.depth === 0) return row.name;
  const segments = row.path.split("/");
  const ancestorNames = segments.slice(0, -1).map((_, index) => {
    const ancestorPath = segments.slice(0, index + 1).join("/");
    return pathToName.get(ancestorPath) ?? ancestorPath;
  });
  // Root stays visible for depth-1; deeper rows skip the root for a shorter chain.
  const chain = row.depth === 1 ? ancestorNames : ancestorNames.slice(1);
  return `${row.name}(${chain.join("->")})`;
}

function NameCell({ data, context }: ICellRendererParams<CategoryGridRow, unknown, CategoryGridContext>) {
  if (!data) return null;
  // Subscribe to revision so reactive custom components re-render when only the image changes.
  const imageKey = `${context?.imageRevision ?? ""}:${data.imageStorageId ?? ""}:${data.imageUrl ?? "empty"}`;
  return (
    <div className="flex w-full min-w-0 items-center gap-3">
      <div className="size-9 shrink-0 overflow-hidden bg-soft-cloud">
        {data.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={imageKey} src={data.imageUrl} alt="" className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center text-mute">
            <ImagePlus className="size-4" aria-hidden />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1 leading-snug">
        <p className="truncate text-sm font-medium text-ink">{data.hierarchyLabel}</p>
        <p className="truncate font-mono text-xs text-mute">{data.slug}</p>
      </div>
    </div>
  );
}

function StatusCell({ data }: ICellRendererParams<CategoryRow>) {
  if (!data) return null;
  return (
    <div className="flex w-full items-center">
      <span
        className={cn(
          "inline-flex rounded-full px-2.5 py-1 text-xs font-medium",
          data.isActive ? "bg-soft-cloud text-ink" : "bg-canvas text-mute ring-1 ring-inset ring-hairline",
        )}
      >
        {data.isActive ? "Active" : "Hidden"}
      </span>
    </div>
  );
}

function ActionsCell({ data, context }: ICellRendererParams<CategoryRow, unknown, CategoryGridContext>) {
  if (!data || !context?.canEdit) return null;
  return (
    <div className="flex w-full items-center justify-end gap-1">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Add child category"
        title="Add child"
        onClick={() => context.onAddChild(data)}
      >
        <FolderPlus className="size-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Edit category"
        title="Edit"
        onClick={() => context.onEdit(data)}
      >
        <Pencil className="size-4" />
      </Button>
      <ConfirmDialog
        trigger={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Delete category"
            title="Delete"
            disabled={data.childCount > 0}
          >
            <Trash2 className="size-4" />
          </Button>
        }
        title="Delete this category?"
        description={
          data.childCount > 0
            ? "Remove child categories first."
            : "Products linked to this category must be reassigned first."
        }
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          await context.onDelete(data);
        }}
      />
    </div>
  );
}

export function VendorCategories() {
  const me = useVendor();
  const canEdit =
    me.vendor.status !== "suspended" &&
    (me.membership.role === "owner" || me.membership.role === "manager");
  const rows = useQuery(api.categories.list, { activeOnly: false });
  const ensureSeeded = useMutation(api.categories.ensureSeeded);
  const remove = useMutation(api.categories.remove);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [quickFilter, setQuickFilter] = useState("");
  const seeded = useRef(false);
  const gridRef = useRef<AgGridReact<CategoryGridRow>>(null);

  useEffect(() => {
    if (seeded.current || rows === undefined) return;
    if (rows.length > 0) {
      seeded.current = true;
      return;
    }
    seeded.current = true;
    void ensureSeeded({});
  }, [rows, ensureSeeded]);

  const gridRows = useMemo<CategoryGridRow[]>(() => {
    if (!rows) return [];
    const pathToName = new Map(rows.map((row) => [row.path, row.name]));
    return rows.map((row) => ({
      ...row,
      hierarchyLabel: formatHierarchyLabel(row, pathToName),
    }));
  }, [rows]);

  // Fingerprint of every row image so AG Grid React cells re-render after save/clear.
  const imageRevision = useMemo(
    () => gridRows.map((row) => `${row._id}:${row.imageStorageId ?? ""}:${row.imageUrl ?? ""}`).join("|"),
    [gridRows],
  );

  const parentOptions = useMemo(
    () =>
      gridRows.map((row) => ({
        id: row._id,
        label: row.hierarchyLabel,
        path: row.path,
      })),
    [gridRows],
  );

  const onDelete = useCallback(
    async (row: CategoryRow) => {
      await remove({ categoryId: row._id });
      toast.success("Category deleted.");
    },
    [remove],
  );

  const gridContext = useMemo<CategoryGridContext>(
    () => ({
      canEdit,
      imageRevision,
      onAddChild: (row) => setEditor({ mode: "create", parentId: row._id }),
      onEdit: (row) => setEditor({ mode: "edit", row }),
      onDelete,
    }),
    [canEdit, imageRevision, onDelete],
  );

  const onRowDataUpdated = useCallback(() => {
    const api = gridRef.current?.api;
    if (!api) return;
    api.refreshCells({ columns: ["name"], force: true });
  }, []);

  const columnDefs = useMemo<ColDef<CategoryGridRow>[]>(
    () => [
      {
        headerName: "Name",
        colId: "name",
        minWidth: 280,
        flex: 2.4,
        // Include image ids so the cell value changes when a photo is saved/cleared.
        valueGetter: (params: ValueGetterParams<CategoryGridRow>) =>
          `${params.data?.hierarchyLabel ?? ""}\0${params.data?.imageStorageId ?? ""}\0${params.data?.imageUrl ?? ""}`,
        cellRenderer: NameCell,
        cellClass: "vendor-ag-cell-start",
        headerClass: "vendor-ag-header-start",
        comparator: (_a, _b, nodeA, nodeB) =>
          (nodeA?.data?.hierarchyLabel ?? "").localeCompare(nodeB?.data?.hierarchyLabel ?? ""),
        getQuickFilterText: (params) =>
          `${params.data?.hierarchyLabel ?? ""} ${params.data?.name ?? ""} ${params.data?.slug ?? ""}`,
      },
      {
        headerName: "Parent",
        field: "parentName",
        minWidth: 120,
        maxWidth: 160,
        cellClass: "vendor-ag-cell-start",
        headerClass: "vendor-ag-header-start",
        valueFormatter: (params: ValueFormatterParams<CategoryGridRow>) => params.value ?? "—",
        getQuickFilterText: (params) => params.data?.parentName ?? "",
      },
      {
        headerName: "Path",
        field: "path",
        minWidth: 160,
        flex: 1.1,
        cellClass: "vendor-ag-cell-start font-mono text-xs text-mute",
        headerClass: "vendor-ag-header-start",
        getQuickFilterText: (params) => params.data?.path ?? "",
      },
      {
        headerName: "Order",
        field: "sortOrder",
        minWidth: 80,
        maxWidth: 96,
        cellClass: "vendor-ag-cell-center",
        headerClass: "vendor-ag-header-center",
      },
      {
        headerName: "Status",
        field: "isActive",
        minWidth: 100,
        maxWidth: 120,
        cellRenderer: StatusCell,
        cellClass: "vendor-ag-cell-start",
        headerClass: "vendor-ag-header-start",
        valueFormatter: (params) => (params.value ? "Active" : "Hidden"),
      },
      ...(canEdit
        ? [
            {
              headerName: "",
              colId: "actions",
              minWidth: 120,
              maxWidth: 132,
              sortable: false,
              resizable: false,
              cellRenderer: ActionsCell,
              cellClass: "vendor-ag-cell-end",
              headerClass: "vendor-ag-header-end",
            } satisfies ColDef<CategoryGridRow>,
          ]
        : []),
    ],
    [canEdit],
  );

  const getRowId = useCallback((params: { data: CategoryGridRow }) => params.data._id, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col p-0 m-0">
      <div className="sticky top-0 z-20 shrink-0 bg-canvas">
        <div className="flex h-14 items-center justify-between gap-3 border-b border-hairline px-4">
          <h2 className="text-xl font-medium tracking-tight text-ink">Categories</h2>
          {canEdit ? (
            <Button size="sm" onClick={() => setEditor({ mode: "create" })}>
              <Plus />
              Add Category
            </Button>
          ) : null}
        </div>
        <div className="border-b border-hairline px-4 py-3">
          <div className="relative w-full">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-mute" />
            <Input
              value={quickFilter}
              onChange={(event) => setQuickFilter(event.target.value)}
              placeholder="Search categories…"
              className="h-11 w-full rounded-none pl-10 text-sm"
              aria-label="Search categories"
            />
          </div>
        </div>
      </div>

      {rows === undefined ? (
        <div className="min-h-0 flex-1 animate-pulse bg-soft-cloud" />
      ) : rows.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <EmptyState
            icon={FolderTree}
            title="No categories yet"
            description="Add a root category, or wait a moment while the default Clothes → Men tree is seeded."
            action={
              canEdit ? (
                <Button onClick={() => setEditor({ mode: "create" })}>Add Category</Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <VendorDataGrid<CategoryGridRow>
          ref={gridRef}
          className="vendor-ag-grid m-0 min-h-0 flex-1 p-0"
          rowData={gridRows}
          columnDefs={columnDefs}
          context={gridContext}
          getRowId={getRowId}
          quickFilterText={quickFilter}
          density="compact"
          rowHeight={52}
          headerHeight={40}
          height="100%"
          reactiveCustomComponents
          onRowDataUpdated={onRowDataUpdated}
          pagination
          paginationPageSize={25}
          paginationPageSizeSelector={[10, 25, 50, 100]}
        />
      )}

      {editor && canEdit ? (
        <CategoryDialog
          state={editor}
          parentOptions={parentOptions}
          onClose={() => setEditor(null)}
        />
      ) : null}
    </div>
  );
}

function CategoryDialog({
  state,
  parentOptions,
  onClose,
}: {
  state: EditorState;
  parentOptions: { id: Id<"categories">; label: string; path: string }[];
  onClose: () => void;
}) {
  const create = useMutation(api.categories.create);
  const update = useMutation(api.categories.update);
  const { upload, isUploading } = useUpload("category");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editing = state.mode === "edit" ? state.row : null;
  const [name, setName] = useState(editing?.name ?? "");
  const [slug, setSlug] = useState(editing?.slug ?? "");
  const [parentId, setParentId] = useState<string>(
    editing ? (editing.parentId ?? "") : state.mode === "create" && state.parentId ? state.parentId : "",
  );
  const [sortOrder, setSortOrder] = useState(String(editing?.sortOrder ?? 0));
  const [isActive, setIsActive] = useState(editing?.isActive ?? true);
  const [imageStorageId, setImageStorageId] = useState<Id<"_storage"> | null>(
    editing?.imageStorageId ?? null,
  );
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(editing?.imageUrl ?? null);
  const [imageCleared, setImageCleared] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    return () => {
      if (imagePreviewUrl?.startsWith("blob:")) URL.revokeObjectURL(imagePreviewUrl);
    };
  }, [imagePreviewUrl]);

  const parentChoices = parentOptions.filter((option) => {
    if (!editing) return true;
    if (option.id === editing._id) return false;
    // Can't nest under a descendant of the current node.
    return !option.path.startsWith(`${editing.path}/`);
  });

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
    setImagePreviewUrl((current) => {
      if (current?.startsWith("blob:")) URL.revokeObjectURL(current);
      return preview;
    });
    try {
      const storageId = await upload(file, `category-${file.name}`);
      setImageStorageId(storageId);
      setImageCleared(false);
    } catch (error) {
      toast.error(reportError(error).message);
      setImagePreviewUrl((current) => {
        if (current?.startsWith("blob:")) URL.revokeObjectURL(current);
        return editing?.imageUrl ?? null;
      });
      setImageStorageId(editing?.imageStorageId ?? null);
    }
  }

  function clearImage() {
    setImagePreviewUrl((current) => {
      if (current?.startsWith("blob:")) URL.revokeObjectURL(current);
      return null;
    });
    setImageStorageId(null);
    setImageCleared(true);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending || isUploading) return;
    setPending(true);
    try {
      const order = Number(sortOrder);
      const args = {
        name: name.trim(),
        slug: slug.trim() || undefined,
        parentId: parentId ? (parentId as Id<"categories">) : undefined,
        sortOrder: Number.isFinite(order) ? Math.max(0, Math.round(order)) : 0,
        isActive,
      };
      if (editing) {
        const previousImageId = editing.imageStorageId ?? null;
        const nextImageId = imageCleared ? null : imageStorageId;
        await update({
          categoryId: editing._id,
          name: args.name,
          slug: args.slug,
          parentId: parentId ? (parentId as Id<"categories">) : null,
          // Always send when image changed so the grid query picks up the new storage id.
          ...(nextImageId !== previousImageId ? { imageStorageId: nextImageId } : {}),
          sortOrder: args.sortOrder,
          isActive: args.isActive,
        });
        toast.success("Category updated.");
      } else {
        await create({
          ...args,
          ...(imageStorageId ? { imageStorageId } : {}),
        });
        toast.success("Category created.");
      }
      onClose();
    } catch (error) {
      toast.error(reportError(error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={(event) => void submit(event)} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit category" : "New category"}</DialogTitle>
          </DialogHeader>
          <Field label="Image" hint="Optional. JPEG, PNG, or WebP up to 5 MB.">
            <div className="flex items-center gap-3">
              <div className="size-20 shrink-0 overflow-hidden bg-soft-cloud">
                {imagePreviewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={imagePreviewUrl}
                    alt=""
                    className={cn("size-full object-cover", isUploading && "opacity-50")}
                  />
                ) : (
                  <div className="flex size-full items-center justify-center text-mute">
                    <ImagePlus className="size-5" aria-hidden />
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={(event) => void onPickImage(event.target.files?.[0])}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={pending || isUploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {isUploading ? "Uploading…" : imagePreviewUrl ? "Replace" : "Upload"}
                </Button>
                {imagePreviewUrl ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={pending || isUploading}
                    onClick={clearImage}
                  >
                    <X className="size-4" aria-hidden />
                    Remove
                  </Button>
                ) : null}
              </div>
            </div>
          </Field>
          <Field label="Name">
            <Input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="Shirt" />
          </Field>
          <Field label="Slug" hint="Optional. Auto-generated from the name when blank.">
            <Input maxLength={60} value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="shirt" />
          </Field>
          <Field label="Parent">
            <select
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              className="h-12 w-full rounded-full bg-soft-cloud px-4 text-sm outline-none focus:bg-canvas focus:ring-2 focus:ring-ink"
            >
              <option value="">Root (no parent)</option>
              {parentChoices.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Sort order">
              <Input type="number" min={0} step={1} value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
            </Field>
            <label className="flex h-12 items-center justify-between self-end rounded-full bg-soft-cloud px-4 text-sm font-medium">
              Active
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="size-5 accent-ink"
              />
            </label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending || isUploading}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || isUploading}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
