"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  Eye,
  EyeOff,
  ImagePlus,
  Layers,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { attributeSlug, isColourAttributeType } from "@convex/shared/attributes";
import { COLOUR_HEX } from "@convex/shared/variants";
import { EmptyState } from "@/components/common/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useVendor } from "@/components/vendor/VendorDesk";
import { useUpload } from "@/hooks/use-upload";
import { reportError } from "@/lib/client-errors";
import { cn } from "@/lib/cn";

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const DEFAULT_PICKER_HEX = "#111111";
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function pickerHex(value: string | undefined | null): string {
  return value && HEX_RE.test(value) ? value : DEFAULT_PICKER_HEX;
}

function displayHex(row: { hex?: string | null; value: string }): string {
  if (row.hex && HEX_RE.test(row.hex)) return row.hex;
  return COLOUR_HEX[row.value] ?? DEFAULT_PICKER_HEX;
}

type AttrType = FunctionReturnType<typeof api.attributes.listTypes>[number];
type AttrRow = FunctionReturnType<typeof api.attributes.list>[number];
type CatRow = FunctionReturnType<typeof api.categories.list>[number];

type TypeEditor = { mode: "create" } | { mode: "edit"; type: AttrType };
type AttrEditor =
  | { mode: "create"; attributeTypeId: Id<"attributeTypes"> }
  | { mode: "edit"; row: AttrRow };

function ColourSwatch({
  hex,
  size = "md",
  className,
}: {
  hex: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const dim = size === "sm" ? "size-5" : "size-7";
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block shrink-0 rounded-full border border-hairline",
        dim,
        className,
      )}
      style={{ backgroundColor: hex }}
    />
  );
}

function HexControl({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <label
        className={cn(
          "relative size-9 shrink-0 overflow-hidden rounded-full border border-hairline bg-soft-cloud",
          disabled ? "opacity-50" : "cursor-pointer",
        )}
      >
        <span
          className="absolute inset-0"
          style={{ backgroundColor: pickerHex(value) }}
        />
        <input
          type="color"
          aria-label="Pick a colour"
          disabled={disabled}
          value={pickerHex(value)}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
      <InputGroup className="h-9 w-[7.5rem]">
        <InputGroupAddon>
          <span className="font-mono text-xs text-mute">#</span>
        </InputGroupAddon>
        <InputGroupInput
          value={value.replace(/^#/, "")}
          onChange={(e) => {
            const raw = e.target.value.replace(/[^0-9a-fA-F]/g, "").slice(0, 6);
            onChange(`#${raw}`);
          }}
          placeholder="c4a574"
          maxLength={6}
          disabled={disabled}
          className="font-mono text-sm uppercase"
          aria-label="Hex colour"
        />
      </InputGroup>
    </div>
  );
}

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
  const [seeding, setSeeding] = useState(false);

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
  const selectedIsColour = Boolean(selected && isColourAttributeType(selected.slug));

  useEffect(() => {
    setFilter("");
  }, [selectedTypeId]);

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
        row.value.toLowerCase().includes(q) ||
        (row.hex?.toLowerCase().includes(q) ?? false),
    );
  }, [attrs, filter]);

  const hasSizeColour =
    sortedTypes.some((t) => t.slug === "size") && sortedTypes.some((t) => t.slug === "colour");

  const categoryNameById = useMemo(() => {
    const map = new Map<Id<"categories">, string>();
    for (const cat of categories ?? []) {
      map.set(cat._id, cat.path || cat.name);
    }
    return map;
  }, [categories]);

  async function onSeed() {
    if (seeding || !canEdit) return;
    setSeeding(true);
    try {
      const result = await seedDefaults({});
      toast.success(`Ready: ${result.types} types · ${result.attributes} attributes.`);
    } catch (caught) {
      toast.error(reportError(caught).message);
    } finally {
      setSeeding(false);
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

  function categorySummary(row: AttrRow): string {
    if (row.categoryIds.length === 0) return "All categories";
    if (row.categoryIds.length === 1) {
      return categoryNameById.get(row.categoryIds[0]!) ?? "1 category";
    }
    return `${row.categoryIds.length} categories`;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="sticky top-0 z-20 shrink-0 bg-canvas">
        <div className="flex h-14 items-center justify-between gap-3 border-b border-hairline px-4">
          <div className="min-w-0">
            <h2 className="text-xl font-medium tracking-tight text-ink">Attributes</h2>
            <p className="truncate text-xs text-mute">
              Fashion vocabulary used by filters and Variants.
            </p>
          </div>
          {canEdit ? (
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label="More tools"
                  className={buttonVariants({ variant: "secondary", size: "icon-sm" })}
                >
                  <MoreHorizontal className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem disabled={seeding} onClick={() => void onSeed()}>
                    <Sparkles className="size-4" />
                    {seeding
                      ? "Seeding…"
                      : hasSizeColour
                        ? "Refresh Size + Colour"
                        : "Seed Size + Colour"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button type="button" size="sm" onClick={() => setTypeEditor({ mode: "create" })}>
                <Plus />
                Add type
              </Button>
            </div>
          ) : null}
        </div>

        {sortedTypes.length > 0 ? (
          <div className="flex flex-wrap items-center gap-3 border-b border-hairline px-4 py-3">
            <div className="w-full max-w-sm space-y-1.5">
              <p className="text-xs font-medium text-mute">Attribute type</p>
              <Combobox
                items={sortedTypes}
                value={selected}
                onValueChange={(next) => {
                  if (next) setSelectedTypeId(next._id);
                }}
                itemToStringLabel={(item) => item.displayLabel || item.label}
                isItemEqualToValue={(a, b) => a._id === b._id}
                autoHighlight
              >
                <ComboboxInput
                  aria-label="Search attribute types"
                  placeholder="Search types…"
                  className="h-10 w-full"
                />
                <ComboboxContent className="min-w-[var(--anchor-width)]">
                  <ComboboxEmpty>No matching types.</ComboboxEmpty>
                  <ComboboxList>
                    {(type: AttrType) => (
                      <ComboboxItem
                        key={type._id}
                        value={type}
                        className={cn(!type.isActive && "opacity-50")}
                      >
                        <span className="min-w-0 flex-1 truncate">
                          {type.displayLabel || type.label}
                        </span>
                        <span className="font-mono text-[11px] text-mute">
                          {type.slug}
                        </span>
                        {!type.isActive ? (
                          <Badge variant="secondary" className="text-[10px]">
                            Hidden
                          </Badge>
                        ) : null}
                      </ComboboxItem>
                    )}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
            </div>
            <p className="pt-5 text-xs text-mute">
              {sortedTypes.length} type{sortedTypes.length === 1 ? "" : "s"}
            </p>
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
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-medium text-ink">
                  {selected.displayLabel || selected.label}
                </h3>
                <Badge variant="outline" className="font-mono text-[11px] font-normal">
                  {selected.slug}
                </Badge>
                {!selected.isActive ? <Badge variant="secondary">Hidden</Badge> : null}
              </div>
              <p className="text-xs text-mute">
                {attrs === undefined
                  ? "Loading values…"
                  : `${filteredAttrs.length} value${filteredAttrs.length === 1 ? "" : "s"}`}
                {filter.trim() && attrs ? ` of ${attrs.length}` : ""}
              </p>
            </div>
            {canEdit ? (
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => void toggleTypeActive()}>
                  {selected.isActive ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  {selected.isActive ? "Hide type" : "Show type"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setTypeEditor({ mode: "edit", type: selected })}
                >
                  <Pencil className="size-4" />
                  Edit
                </Button>
              </div>
            ) : null}
          </div>

          <Separator />

          <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <InputGroup className="h-10 w-full max-w-sm">
              <InputGroupAddon>
                <Search />
              </InputGroupAddon>
              <InputGroupInput
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter values…"
              />
            </InputGroup>

            {canEdit ? (
              <Button
                type="button"
                size="sm"
                onClick={() =>
                  setAttrEditor({ mode: "create", attributeTypeId: selected._id })
                }
              >
                <Plus />
                Add value
              </Button>
            ) : null}
          </div>

          <Separator />

          <div className="min-h-0 flex-1 overflow-auto">
            {!attrs ? (
              <div className="p-6 text-sm text-mute">Loading values…</div>
            ) : filteredAttrs.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 px-4 py-16 text-center">
                <p className="text-sm font-medium text-ink">
                  {filter.trim() ? "No matching values" : "No values yet"}
                </p>
                <p className="max-w-sm text-xs text-mute">
                  {filter.trim()
                    ? "Try a different search."
                    : selectedIsColour
                      ? "Click Add value to create a colour with a hex swatch."
                      : "Click Add value to create the first attribute in this type."}
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="px-4 text-xs text-mute">Label</TableHead>
                    <TableHead className="px-4 text-xs text-mute">Value</TableHead>
                    <TableHead className="px-4 text-xs text-mute">Slug</TableHead>
                    {selectedIsColour ? (
                      <TableHead className="px-4 text-xs text-mute">Hex</TableHead>
                    ) : null}
                    <TableHead className="px-4 text-xs text-mute">Scope</TableHead>
                    <TableHead className="px-4 text-xs text-mute">Status</TableHead>
                    {canEdit ? (
                      <TableHead className="w-12 px-4 text-right text-xs text-mute">
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    ) : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAttrs.map((row) => (
                    <TableRow
                      key={row._id}
                      className={cn(!row.isActive && "opacity-60")}
                    >
                      <TableCell className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {row.mediaUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={row.mediaUrl}
                              alt=""
                              className="size-8 shrink-0 object-cover"
                            />
                          ) : selectedIsColour ? (
                            <ColourSwatch hex={displayHex(row)} />
                          ) : null}
                          <span className="font-medium text-ink">{row.label}</span>
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-3 font-mono text-xs text-mute">
                        {row.value}
                      </TableCell>
                      <TableCell className="px-4 py-3 font-mono text-xs text-mute">
                        {row.slug}
                      </TableCell>
                      {selectedIsColour ? (
                        <TableCell className="px-4 py-3 font-mono text-xs text-mute">
                          {row.hex && HEX_RE.test(row.hex) ? row.hex : "—"}
                        </TableCell>
                      ) : null}
                      <TableCell className="max-w-[12rem] truncate px-4 py-3 text-sm text-mute">
                        {categorySummary(row)}
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <Badge variant={row.isActive ? "outline" : "secondary"}>
                          {row.isActive ? "Active" : "Hidden"}
                        </Badge>
                      </TableCell>
                      {canEdit ? (
                        <TableCell className="px-4 py-3 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              aria-label={`Actions for ${row.label}`}
                              className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
                            >
                              <MoreHorizontal className="size-4" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-40">
                              <DropdownMenuItem
                                onClick={() => setAttrEditor({ mode: "edit", row })}
                              >
                                <Pencil className="size-4" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => void toggleAttrActive(row)}>
                                {row.isActive ? (
                                  <EyeOff className="size-4" />
                                ) : (
                                  <Eye className="size-4" />
                                )}
                                {row.isActive ? "Hide" : "Show"}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
          existingValues={(attrs ?? []).map((row) => row.value)}
          isColour={selectedIsColour}
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
  onCreate: (values: {
    label: string;
    displayLabel?: string;
    isEnableFilter?: boolean;
  }) => Promise<void>;
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editor.mode === "create" ? "Add attribute type" : "Edit attribute type"}
          </DialogTitle>
          <DialogDescription>
            Types group values like Size, Colour, or Pattern for filters and Variants.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void onSubmit(e)}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="attr-type-label">Label</FieldLabel>
              <Input
                id="attr-type-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                required
                maxLength={40}
                placeholder="e.g. Colour"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="attr-type-display">Display label</FieldLabel>
              <Input
                id="attr-type-display"
                value={displayLabel}
                onChange={(e) => setDisplayLabel(e.target.value)}
                placeholder={label || "Shown in filters"}
                maxLength={60}
              />
              <FieldDescription>Optional override for storefront filters.</FieldDescription>
            </Field>
            <Field orientation="horizontal" className="items-center">
              <Checkbox
                id="attr-type-filter"
                checked={isEnableFilter}
                onCheckedChange={(checked) => setIsEnableFilter(checked === true)}
              />
              <FieldLabel htmlFor="attr-type-filter" className="font-normal">
                Enable as storefront filter
              </FieldLabel>
            </Field>
          </FieldGroup>
          <DialogFooter className="mt-6">
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
  existingValues,
  isColour,
  canEdit,
  onClose,
  onCreate,
  onUpdate,
}: {
  editor: AttrEditor;
  categories: CatRow[];
  existingValues: string[];
  isColour: boolean;
  canEdit: boolean;
  onClose: () => void;
  onCreate: (values: {
    label: string;
    value: string;
    hex?: string;
    categoryIds?: Id<"categories">[];
    mediaStorageId?: Id<"_storage">;
  }) => Promise<void>;
  onUpdate: (values: {
    label?: string;
    value?: string;
    hex?: string | null;
    categoryIds?: Id<"categories">[];
    mediaStorageId?: Id<"_storage"> | null;
  }) => Promise<void>;
}) {
  const existing = editor.mode === "edit" ? editor.row : null;
  const { upload, isUploading } = useUpload("attribute");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [label, setLabel] = useState(existing?.label ?? "");
  const [value, setValue] = useState(existing?.value ?? "");
  const [valueTouched, setValueTouched] = useState(Boolean(existing));
  const [hex, setHex] = useState(existing?.hex ?? DEFAULT_PICKER_HEX);
  const [categoryIds, setCategoryIds] = useState<Id<"categories">[]>(existing?.categoryIds ?? []);
  const [mediaStorageId, setMediaStorageId] = useState<Id<"_storage"> | null>(
    existing?.mediaStorageId ?? null,
  );
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(existing?.mediaUrl ?? null);
  const [imageCleared, setImageCleared] = useState(false);
  const [saving, setSaving] = useState(false);

  const previewValue = valueTouched ? attributeSlug(value) : attributeSlug(label);
  const previewSlug = attributeSlug(label) || previewValue;

  const takenValues = useMemo(() => new Set(existingValues), [existingValues]);
  const valueTaken =
    Boolean(previewValue) &&
    takenValues.has(previewValue) &&
    previewValue !== existing?.value;

  useEffect(() => {
    return () => {
      if (imagePreviewUrl?.startsWith("blob:")) URL.revokeObjectURL(imagePreviewUrl);
    };
  }, [imagePreviewUrl]);

  function toggleCategory(id: Id<"categories">) {
    setCategoryIds((prev) =>
      prev.includes(id) ? prev.filter((row) => row !== id) : [...prev, id],
    );
  }

  async function onPickImage(file: File | undefined) {
    if (!file || !canEdit) return;
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
      const storageId = await upload(file, `attribute-${file.name}`);
      setMediaStorageId(storageId);
      setImageCleared(false);
    } catch (error) {
      toast.error(reportError(error).message);
      setImagePreviewUrl((current) => {
        if (current?.startsWith("blob:")) URL.revokeObjectURL(current);
        return existing?.mediaUrl ?? null;
      });
      setMediaStorageId(existing?.mediaStorageId ?? null);
    }
  }

  function clearImage() {
    setImagePreviewUrl((current) => {
      if (current?.startsWith("blob:")) URL.revokeObjectURL(current);
      return null;
    });
    setMediaStorageId(null);
    setImageCleared(true);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canEdit || saving || isUploading) return;
    if (!label.trim()) return;
    if (!previewValue) {
      toast.error("Enter a value that can become a slug.");
      return;
    }
    if (valueTaken) {
      toast.error("That attribute value already exists on this type.");
      return;
    }
    if (isColour && !HEX_RE.test(hex.trim())) {
      toast.error("Pick a hex colour like #c4a574.");
      return;
    }
    setSaving(true);
    try {
      const colourHex = isColour ? hex.trim().toLowerCase() : undefined;
      if (editor.mode === "create") {
        await onCreate({
          label: label.trim(),
          value: previewValue,
          categoryIds,
          hex: colourHex,
          ...(mediaStorageId ? { mediaStorageId } : {}),
        });
      } else {
        const previousMediaId = existing?.mediaStorageId ?? null;
        const nextMediaId = imageCleared ? null : mediaStorageId;
        await onUpdate({
          label: label.trim(),
          value: previewValue,
          categoryIds,
          hex: colourHex ?? null,
          ...(nextMediaId !== previousMediaId ? { mediaStorageId: nextMediaId } : {}),
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
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editor.mode === "create" ? "Add attribute" : "Edit attribute"}
          </DialogTitle>
          <DialogDescription>
            {isColour
              ? "Set the label, value, image, hex swatch, and optional category scope."
              : "Set the label, value, image, and optional category scope."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void onSubmit(e)}>
          <FieldGroup>
            <Field>
              <FieldLabel>Image</FieldLabel>
              <FieldDescription>Optional. JPEG, PNG, or WebP up to 5 MB.</FieldDescription>
              <div className="mt-2 flex items-center gap-3">
                <div className="size-16 shrink-0 overflow-hidden bg-soft-cloud">
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
                    disabled={!canEdit || saving || isUploading}
                    onChange={(event) => void onPickImage(event.target.files?.[0])}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={!canEdit || saving || isUploading}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {isUploading ? "Uploading…" : imagePreviewUrl ? "Replace" : "Upload"}
                  </Button>
                  {imagePreviewUrl ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={!canEdit || saving || isUploading}
                      onClick={clearImage}
                    >
                      <X className="size-4" aria-hidden />
                      Remove
                    </Button>
                  ) : null}
                </div>
              </div>
            </Field>
            <Field>
              <FieldLabel htmlFor="attr-label">Label</FieldLabel>
              <Input
                id="attr-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                required
                maxLength={60}
                placeholder={isColour ? "e.g. Navy" : "e.g. Medium"}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="attr-value">Value</FieldLabel>
              <Input
                id="attr-value"
                value={valueTouched ? value : previewValue}
                onChange={(e) => {
                  setValueTouched(true);
                  setValue(e.target.value);
                }}
                required
                maxLength={60}
                placeholder={isColour ? "navy" : "m"}
                className="font-mono text-sm"
                aria-invalid={valueTaken || undefined}
              />
              <FieldDescription>
                {valueTaken
                  ? "That value already exists on this type."
                  : existing
                    ? "Machine id for filters and Variants."
                    : "Machine id for filters and Variants. Auto-fills from the label."}
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="attr-slug">Slug</FieldLabel>
              <Input
                id="attr-slug"
                value={previewSlug}
                readOnly
                disabled
                className="font-mono text-sm"
              />
              <FieldDescription>Auto-generated from the label.</FieldDescription>
            </Field>
            {isColour ? (
              <Field>
                <FieldLabel>Hex colour</FieldLabel>
                <HexControl value={hex} onChange={setHex} disabled={!canEdit} />
                <FieldDescription>Pick a swatch or type a 6-digit hex.</FieldDescription>
              </Field>
            ) : null}
            <Field>
              <FieldLabel>Categories</FieldLabel>
              <FieldDescription>
                Leave empty to apply this value across all categories.
              </FieldDescription>
              <ScrollArea className="mt-2 h-48 rounded-lg border border-hairline">
                <div className="space-y-1 p-2">
                  {categories.length === 0 ? (
                    <p className="px-2 py-3 text-xs text-mute">No categories yet.</p>
                  ) : (
                    categories.map((cat) => {
                      const checked = categoryIds.includes(cat._id);
                      return (
                        <label
                          key={cat._id}
                          className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-soft-cloud"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggleCategory(cat._id)}
                          />
                          <span className="truncate">{cat.path || cat.name}</span>
                        </label>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </Field>
          </FieldGroup>
          <DialogFooter className="mt-6">
            <Button type="button" variant="secondary" onClick={onClose} disabled={saving || isUploading}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                !canEdit ||
                saving ||
                isUploading ||
                !label.trim() ||
                !previewValue ||
                valueTaken ||
                (isColour && !HEX_RE.test(hex.trim()))
              }
            >
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
