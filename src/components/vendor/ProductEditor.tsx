"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { ArrowLeft, ImagePlus, Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import type { FunctionReturnType } from "convex/server";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { COLOUR_HEX } from "@convex/shared/variants";
import {
  AGE_GROUPS,
  AGE_GROUP_LABELS,
  ATTR,
  attrLabel,
  isProductType,
  MAX_INFO_SECTIONS,
  MAX_PRODUCT_IMAGES,
  OCCASIONS,
  OCCASION_LABELS,
  productTypeLabel,
  productTypesFor,
  type AgeGroup,
  type InfoSectionKind,
  type Occasion,
  type ProductCategory,
} from "@convex/shared/products";
import type { Presentation } from "@convex/shared/wardrobe";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CategoryTreePicker } from "@/components/vendor/CategoryTreePicker";
import { useVendor } from "@/components/vendor/VendorDesk";
import { useUpload } from "@/hooks/use-upload";
import { reportError } from "@/lib/client-errors";
import { cn } from "@/lib/cn";
import { formatInr } from "@/lib/format";
import { routes } from "@/lib/routes";

const AUDIENCE: { value: Presentation; label: string }[] = [
  { value: "masculine", label: "Men" },
  { value: "feminine", label: "Women" },
  { value: "neutral", label: "Everyone" },
];
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

type Slot = { key: string; storageId?: Id<"_storage">; previewUrl: string; uploading: boolean };

type VariantRow = {
  key: string;
  id?: Id<"productVariants">;
  optionIds: Id<"variantOptions">[];
  size: string;
  colourName: string;
  colourHex: string;
  priceInr: string;
  stock: string;
  active: boolean;
};

type AttrRow = { key: string; keyInput: string; label: string; value: string };
type InfoRow = {
  id: string;
  title: string;
  kind: InfoSectionKind;
  body: string;
  rows: { label: string; value: string }[];
};

const KNOWN_ATTR_KEYS = new Set<string>(Object.values(ATTR));

type Draft = {
  name: string;
  brand: string;
  productType: string;
  subcategory: string;
  description: string;
  category: ProductCategory;
  categoryId: Id<"categories"> | null;
  presentation: Presentation;
  colourPrimary: string;
  colourSecondary: string;
  colourHex: string;
  pattern: string;
  material: string;
  size: string;
  ageGroup: AgeGroup | "";
  occasion: Occasion | "";
  /** Extra vendor-defined attributes beyond the known fashion fields. */
  customAttributes: AttrRow[];
  infoSections: InfoRow[];
  priceInr: string;
  compareAtPriceInr: string;
  /** Payload-style dimensions enabled on this product. */
  variantTypeIds: Id<"variantTypes">[];
  variants: VariantRow[];
  /** Feeds the stylist shop suggestions when the product is live. */
  aiRecommend: boolean;
};

function newInfoSection(title = ""): InfoRow {
  return {
    id: crypto.randomUUID(),
    title,
    kind: "rich_text",
    body: "",
    rows: [],
  };
}

function newVariant(): VariantRow {
  return {
    key: crypto.randomUUID(),
    optionIds: [],
    size: "",
    colourName: "",
    colourHex: "",
    priceInr: "",
    stock: "0",
    active: true,
  };
}

const EMPTY: Draft = {
  name: "",
  brand: "",
  productType: "",
  subcategory: "",
  description: "",
  category: "clothes",
  categoryId: null,
  presentation: "neutral",
  colourPrimary: "",
  colourSecondary: "",
  colourHex: "",
  pattern: "",
  material: "",
  size: "",
  ageGroup: "",
  occasion: "",
  customAttributes: [],
  infoSections: [
    newInfoSection("Fit, Fabric & Wash Care"),
    newInfoSection("Manufacturing Details"),
    newInfoSection("Alterations, Returns & Exchanges"),
    { ...newInfoSection("FAQ"), kind: "faq" as const },
  ],
  priceInr: "",
  compareAtPriceInr: "",
  variantTypeIds: [],
  variants: [newVariant()],
  aiRecommend: false,
};

type ProductView = NonNullable<FunctionReturnType<typeof api.vendorProducts.get>>;
type VariantCatalog = FunctionReturnType<typeof api.variants.catalog>;
type CatalogType = VariantCatalog[number];
type CatalogOption = CatalogType["options"][number];

function optionById(catalog: VariantCatalog, optionId: Id<"variantOptions">): CatalogOption | undefined {
  for (const type of catalog) {
    const match = type.options.find((option) => option.id === optionId);
    if (match) return match;
  }
  return undefined;
}

/** Keep free-text size/colour in sync with selected catalog options. */
function labelsFromOptions(
  catalog: VariantCatalog,
  optionIds: Id<"variantOptions">[],
): Pick<VariantRow, "size" | "colourName" | "colourHex"> {
  let size = "";
  let colourName = "";
  let colourHex = "";
  for (const optionId of optionIds) {
    const option = optionById(catalog, optionId);
    if (!option) continue;
    const type = catalog.find((row) => row.id === option.variantTypeId);
    if (!type) continue;
    if (type.slug === "size") size = option.label;
    if (type.slug === "colour") {
      colourName = option.label;
      colourHex = COLOUR_HEX[option.value] ?? colourHex;
    }
  }
  return { size, colourName, colourHex };
}

function draftFrom(product: ProductView): Draft {
  const customAttributes = (product.attributes ?? [])
    .filter((row) => !KNOWN_ATTR_KEYS.has(row.key))
    .map((row) => ({
      key: row.key,
      keyInput: row.key,
      label: row.label,
      value: row.value,
    }));
  const infoSections =
    product.infoSections.length > 0
      ? product.infoSections
          .slice()
          .sort((a, b) => a.position - b.position)
          .map((section) => ({
            id: section.id,
            title: section.title,
            kind: section.kind,
            body: section.body ?? "",
            rows: (section.rows ?? []).map((row) => ({ label: row.label, value: row.value })),
          }))
      : EMPTY.infoSections.map((section) => ({ ...section, id: crypto.randomUUID() }));
  return {
    name: product.name,
    brand: product.brand ?? "",
    productType: product.productType ?? "",
    subcategory: product.subcategory,
    description: product.description,
    category: product.category,
    categoryId: product.categoryId,
    presentation: product.presentation,
    colourPrimary: product.colours.primary,
    colourSecondary: product.colours.secondary.join(", "),
    colourHex: product.colours.hex[0] ?? "",
    pattern: product.pattern ?? "",
    material: product.material ?? "",
    size: product.size ?? "",
    ageGroup: product.ageGroup ?? "",
    occasion: product.occasion ?? "",
    customAttributes,
    infoSections,
    priceInr: String(product.priceInr),
    compareAtPriceInr: product.compareAtPriceInr ? String(product.compareAtPriceInr) : "",
    variantTypeIds: product.variantTypeIds,
    aiRecommend: product.aiRecommend,
    variants: product.variants.length
      ? product.variants.map((variant) => ({
          key: variant.id,
          id: variant.id,
          optionIds: variant.optionIds,
          size: variant.size ?? "",
          colourName: variant.colour?.name ?? "",
          colourHex: variant.colour?.hex ?? "",
          priceInr: variant.priceInr === product.priceInr ? "" : String(variant.priceInr),
          stock: String(variant.stock),
          active: variant.active,
        }))
      : [newVariant()],
  };
}

/** Loads the product (when editing) and mounts the form once, keyed so state never needs syncing. */
export function ProductEditor({ productId }: { productId?: Id<"products"> }) {
  const product = useQuery(api.vendorProducts.get, productId ? { productId } : "skip");
  if (productId && product === undefined) return <div className="h-96 animate-pulse bg-soft-cloud" />;
  return <EditorForm key={productId ?? "new"} productId={productId} product={product ?? null} />;
}

function EditorForm({ productId, product }: { productId?: Id<"products">; product: ProductView | null }) {
  const router = useRouter();
  const me = useVendor();
  const create = useMutation(api.vendorProducts.create);
  const update = useMutation(api.vendorProducts.update);
  const publish = useMutation(api.vendorProducts.publish);
  const unpublish = useMutation(api.vendorProducts.unpublish);
  const archive = useMutation(api.vendorProducts.archive);
  const discardImage = useMutation(api.vendorProducts.discardImage);
  const seedVariantDefaults = useMutation(api.variants.seedDefaults);
  const catalog = useQuery(api.variants.catalog, {});
  const describe = useAction(api.ai.openai.describeProduct);
  const { upload } = useUpload("vendor");

  const [draft, setDraft] = useState<Draft>(() => (product ? draftFrom(product) : EMPTY));
  const [slots, setSlots] = useState<Slot[]>(() =>
    (product?.images ?? []).map((image) => ({
      key: image.storageId,
      storageId: image.storageId,
      previewUrl: image.url ?? "",
      uploading: false,
    })),
  );
  const [selectedKey, setSelectedKey] = useState<string | null>(product?.images[0]?.storageId ?? null);
  const [saving, setSaving] = useState(false);
  const [filling, setFilling] = useState(false);
  const [seedingCatalog, setSeedingCatalog] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const seededOnce = useRef(false);
  /** Skip auto Size/Colour enable when editing an existing product. */
  const defaultedTypes = useRef(Boolean(product));
  const locked = me.vendor.status === "suspended" || me.vendor.status === "closed";

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  // Bootstrap Size + Colour once so the desk has options to pick.
  useEffect(() => {
    if (catalog === undefined || catalog.length > 0 || seededOnce.current || locked) return;
    seededOnce.current = true;
    setSeedingCatalog(true);
    void seedVariantDefaults({})
      .then(() => toast.success("Size and colour options ready."))
      .catch((caught) => {
        seededOnce.current = false;
        toast.error(reportError(caught).message);
      })
      .finally(() => setSeedingCatalog(false));
  }, [catalog, locked, seedVariantDefaults]);

  // New products default to Size + Colour once the catalog loads.
  useEffect(() => {
    if (product || !catalog?.length || defaultedTypes.current) return;
    defaultedTypes.current = true;
    const defaults = catalog.filter((type) => type.slug === "size" || type.slug === "colour").map((type) => type.id);
    if (defaults.length > 0) {
      setDraft((current) =>
        current.variantTypeIds.length > 0 ? current : { ...current, variantTypeIds: defaults },
      );
    }
  }, [catalog, product]);

  const enabledTypes = useMemo(() => {
    if (!catalog) return [];
    return catalog.filter((type) => draft.variantTypeIds.includes(type.id));
  }, [catalog, draft.variantTypeIds]);

  function toggleVariantType(typeId: Id<"variantTypes">) {
    const on = draft.variantTypeIds.includes(typeId);
    const nextIds = on ? draft.variantTypeIds.filter((id) => id !== typeId) : [...draft.variantTypeIds, typeId];
    const removedOptionIds = new Set<Id<"variantOptions">>();
    if (on && catalog) {
      const type = catalog.find((row) => row.id === typeId);
      for (const option of type?.options ?? []) removedOptionIds.add(option.id);
    }
    setDraft((current) => ({
      ...current,
      variantTypeIds: nextIds,
      variants: current.variants.map((row) => {
        if (removedOptionIds.size === 0) return row;
        const optionIds = row.optionIds.filter((id) => !removedOptionIds.has(id));
        return {
          ...row,
          optionIds,
          ...(catalog ? labelsFromOptions(catalog, optionIds) : {}),
        };
      }),
    }));
  }

  function setRowOption(rowKey: string, type: CatalogType, optionId: string) {
    if (!catalog) return;
    setDraft((current) => ({
      ...current,
      variants: current.variants.map((row) => {
        if (row.key !== rowKey) return row;
        const withoutType = row.optionIds.filter((id) => {
          const option = optionById(catalog, id);
          return option?.variantTypeId !== type.id;
        });
        const optionIds = optionId
          ? [...withoutType, optionId as Id<"variantOptions">]
          : withoutType;
        return { ...row, optionIds, ...labelsFromOptions(catalog, optionIds) };
      }),
    }));
  }

  /** Build one SKU row per combination of enabled type options (capped). */
  function fillAllCombinations() {
    if (!catalog || enabledTypes.length === 0) return;
    const lists = enabledTypes.map((type) => type.options);
    if (lists.some((list) => list.length === 0)) {
      toast.error("Each enabled dimension needs at least one option.");
      return;
    }
    const MAX_ROWS = 48;
    let combos: CatalogOption[][] = [[]];
    for (const options of lists) {
      const next: CatalogOption[][] = [];
      for (const prefix of combos) {
        for (const option of options) {
          next.push([...prefix, option]);
          if (next.length >= MAX_ROWS) break;
        }
        if (next.length >= MAX_ROWS) break;
      }
      combos = next;
    }
    set(
      "variants",
      combos.map((picked) => {
        const optionIds = picked.map((option) => option.id);
        return { ...newVariant(), optionIds, ...labelsFromOptions(catalog, optionIds), stock: "0" };
      }),
    );
    toast.success(`Created ${combos.length} variant row${combos.length === 1 ? "" : "s"}.`);
  }

  const chosen = slots.find((slot) => slot.key === selectedKey) ?? slots[0] ?? null;
  const uploading = slots.some((slot) => slot.uploading);

  async function addFiles(list: FileList | null) {
    if (!list) return;
    const incoming: { key: string; file: File }[] = [];
    for (const file of list) {
      if (slots.length + incoming.length >= MAX_PRODUCT_IMAGES) {
        toast.error(`A product can have at most ${MAX_PRODUCT_IMAGES} photos.`);
        break;
      }
      if (!IMAGE_TYPES.has(file.type)) {
        toast.error("Use a JPEG, PNG, or WebP image.");
        continue;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        toast.error("Each image must be 5 MB or smaller.");
        continue;
      }
      incoming.push({ key: crypto.randomUUID(), file });
    }
    if (incoming.length === 0) return;
    setSlots((current) => [
      ...current,
      ...incoming.map(({ key, file }) => ({ key, previewUrl: URL.createObjectURL(file), uploading: true })),
    ]);
    if (!selectedKey && incoming[0]) setSelectedKey(incoming[0].key);
    await Promise.all(
      incoming.map(async ({ key, file }) => {
        try {
          const storageId = await upload(file, key);
          setSlots((current) => current.map((slot) => (slot.key === key ? { ...slot, storageId, uploading: false } : slot)));
        } catch (caught) {
          toast.error(reportError(caught).message);
          setSlots((current) => current.filter((slot) => slot.key !== key));
        }
      }),
    );
  }

  async function removeSlot(slot: Slot) {
    if (slot.previewUrl.startsWith("blob:")) URL.revokeObjectURL(slot.previewUrl);
    setSlots((current) => current.filter((item) => item.key !== slot.key));
    if (selectedKey === slot.key) setSelectedKey(null);
    const savedOnProduct = product?.images.some((image) => image.storageId === slot.storageId);
    if (slot.storageId && !savedOnProduct) await discardImage({ storageId: slot.storageId }).catch(() => undefined);
  }

  function makeCover(key: string) {
    setSlots((current) => {
      const index = current.findIndex((slot) => slot.key === key);
      if (index <= 0) return current;
      const next = [...current];
      const [slot] = next.splice(index, 1);
      next.unshift(slot);
      return next;
    });
  }

  async function fillFromPhoto() {
    if (!chosen?.storageId || filling) return;
    setFilling(true);
    try {
      const result = await describe({ storageId: chosen.storageId });
      setDraft((current) => ({
        ...current,
        name: result.name,
        brand: result.brand ?? "",
        subcategory: result.subcategory,
        productType: result.productType ?? "",
        description: result.description,
        category: result.category,
        presentation: result.presentation,
        colourPrimary: result.colours.primary,
        colourSecondary: result.colours.secondary.join(", "),
        colourHex: result.colours.hex,
        size: result.size ?? "",
        ageGroup: result.ageGroup ?? "",
        occasion: result.occasion ?? "",
      }));
      toast.success("Listing filled from the photo. Check it over.");
    } catch (caught) {
      toast.error(reportError(caught).message);
    } finally {
      setFilling(false);
    }
  }

  function buildArgs() {
    const price = Number(draft.priceInr);
    if (!Number.isFinite(price) || price < 0) throw new Error("Enter a price.");
    const compareAt = draft.compareAtPriceInr ? Number(draft.compareAtPriceInr) : undefined;
    const hex = draft.colourHex.trim();
    const subcategory = draft.productType ? productTypeLabel(draft.productType) : draft.subcategory.trim();
    const customAttributes = draft.customAttributes
      .map((row) => {
        const key = row.keyInput.trim().toLowerCase().replace(/\s+/g, "_");
        const value = row.value.trim();
        if (!key || !value || KNOWN_ATTR_KEYS.has(key)) return null;
        return { key, label: row.label.trim() || attrLabel(key), value };
      })
      .filter((row): row is { key: string; label: string; value: string } => row !== null);
    const infoSections = draft.infoSections
      .map((section, position) => {
        const title = section.title.trim();
        if (!title) return null;
        const body = section.body.trim();
        const rows =
          section.kind === "rich_text"
            ? undefined
            : section.rows
                .map((row) => ({ label: row.label.trim(), value: row.value.trim() }))
                .filter((row) => row.label && row.value);
        const hasContent = section.kind === "rich_text" ? Boolean(body) : Boolean(rows?.length);
        if (!hasContent) return null;
        return {
          id: section.id,
          title,
          kind: section.kind,
          body: body || undefined,
          rows,
          position,
        };
      })
      .filter((section): section is NonNullable<typeof section> => section !== null);
    return {
      category: draft.category,
      categoryId: draft.categoryId ?? undefined,
      presentation: draft.presentation,
      name: draft.name.trim(),
      brand: draft.brand.trim() || undefined,
      description: draft.description.trim(),
      attributes: customAttributes,
      infoSections: infoSections.length > 0 ? infoSections : undefined,
      subcategory: subcategory || draft.category,
      productType: draft.productType || undefined,
      colours: {
        primary: draft.colourPrimary.trim(),
        secondary: draft.colourSecondary.split(",").map((part) => part.trim()).filter(Boolean),
        hex: /^#[0-9a-fA-F]{6}$/.test(hex) ? [hex.toLowerCase()] : [],
      },
      pattern: draft.pattern.trim() || undefined,
      material: draft.material.trim() || undefined,
      size: draft.size.trim() || undefined,
      ageGroup: draft.ageGroup || undefined,
      occasion: draft.occasion || undefined,
      priceInr: Math.round(price),
      compareAtPriceInr: compareAt && compareAt > 0 ? Math.round(compareAt) : undefined,
      variantTypeIds: draft.variantTypeIds.length > 0 ? draft.variantTypeIds : undefined,
      aiRecommend: draft.aiRecommend,
      imageIds: slots.flatMap((slot) => (slot.storageId ? [slot.storageId] : [])),
      variants: draft.variants.map((row) => ({
        id: row.id,
        optionIds: row.optionIds.length > 0 ? row.optionIds : undefined,
        size: row.size.trim() || undefined,
        colour:
          row.colourName.trim() || /^#[0-9a-fA-F]{6}$/.test(row.colourHex)
            ? { name: row.colourName.trim() || draft.colourPrimary.trim(), hex: /^#[0-9a-fA-F]{6}$/.test(row.colourHex) ? row.colourHex.toLowerCase() : hex || "#111111" }
            : undefined,
        priceInr: row.priceInr ? Math.round(Number(row.priceInr)) : undefined,
        stock: Math.max(0, Math.round(Number(row.stock) || 0)),
        active: row.active,
      })),
    };
  }

  async function save(): Promise<Id<"products"> | null> {
    if (saving || uploading) return null;
    setSaving(true);
    setError(null);
    try {
      const args = buildArgs();
      if (productId) {
        await update({ productId, ...args });
        toast.success("Saved.");
        return productId;
      }
      const id = await create(args);
      toast.success("Draft saved.");
      router.replace(routes.vendorProduct(id));
      return id;
    } catch (caught) {
      setError(reportError(caught).message);
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function saveAndPublish() {
    const id = await save();
    if (!id) return;
    try {
      await publish({ productId: id });
      toast.success("Published.");
    } catch (caught) {
      setError(reportError(caught).message);
    }
  }

  const knownTypes = productTypesFor(draft.category);
  const coverKey = slots[0]?.key;
  const status = product?.status;
  const statusText =
    status === "active" ? "Live" : status === "draft" ? "Draft" : status === "archived" ? "Archived" : "New";
  const totalStock = draft.variants.reduce((sum, row) => sum + Math.max(0, Math.round(Number(row.stock) || 0)), 0);
  const displayName = draft.name.trim() || (product ? "Untitled product" : "New product");
  const busy = saving || uploading || locked;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="sticky top-0 z-20 shrink-0 border-b border-hairline bg-canvas px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <Button href={routes.vendorProducts} variant="ghost" size="icon-sm" aria-label="Back to products">
            <ArrowLeft className="size-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-medium tracking-tight capitalize">{displayName}</h2>
              <span
                className={cn(
                  "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
                  status === "active" && "bg-soft-cloud text-success",
                  status === "draft" && "bg-soft-cloud text-mute",
                  status === "archived" && "bg-canvas text-mute ring-1 ring-inset ring-hairline",
                  !status && "bg-soft-cloud text-mute",
                )}
              >
                {statusText}
              </span>
            </div>
            <p className="truncate text-xs text-mute">
              {product?.sku ? `SKU ${product.sku}` : "SKU assigned on save"}
              {" · "}
              {draft.variants.length} variant{draft.variants.length === 1 ? "" : "s"}
              {" · "}
              <span className={totalStock === 0 ? "text-sale" : undefined}>{totalStock} in stock</span>
              {draft.priceInr ? ` · ${formatInr(Number(draft.priceInr) || 0)}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {product?.status === "active" ? (
              <Button
                variant="secondary"
                size="sm"
                disabled={locked}
                onClick={() =>
                  void unpublish({ productId: product.id })
                    .then(() => toast.success("Hidden from the shop."))
                    .catch((e) => toast.error(reportError(e).message))
                }
              >
                Unpublish
              </Button>
            ) : null}
            {product && product.status !== "archived" ? (
              <ConfirmDialog
                trigger={
                  <Button variant="ghost" size="icon-sm" disabled={locked} aria-label="Archive product">
                    <Trash2 className="size-4 text-sale" />
                  </Button>
                }
                title="Archive this product?"
                description="It disappears from the shop and every bag. You can't un-archive it, but the record stays for past orders."
                confirmLabel="Archive"
                destructive
                onConfirm={async () => {
                  await archive({ productId: product.id });
                  router.replace(routes.vendorProducts);
                }}
              />
            ) : null}
            <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => void save()}>
              {saving ? "Saving…" : "Save"}
            </Button>
            {product?.status !== "active" ? (
              <Button
                type="button"
                size="sm"
                disabled={busy || me.vendor.status !== "active"}
                onClick={() => void saveAndPublish()}
              >
                Publish
              </Button>
            ) : null}
          </div>
        </div>
        {error ? <p className="mt-2 text-sm text-sale">{error}</p> : null}
        {me.vendor.status !== "active" ? (
          <p className="mt-2 text-xs text-mute">Publishing unlocks once the store is approved.</p>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid items-start gap-8 px-4 py-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <aside className="space-y-3 lg:sticky lg:top-0 lg:self-start">
          <SectionHead title="Media" hint={`Up to ${MAX_PRODUCT_IMAGES} photos · JPEG, PNG, WebP`} />
          <div className="relative aspect-square bg-soft-cloud">
            {chosen?.previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={chosen.previewUrl}
                alt=""
                className={cn("h-full w-full object-cover", chosen.uploading && "opacity-50")}
              />
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center transition hover:bg-hairline-soft"
              >
                <ImagePlus className="size-6" aria-hidden />
                <p className="text-sm font-medium">Add cover photo</p>
                <p className="text-xs text-mute">First image is the shop cover</p>
              </button>
            )}
            {chosen?.uploading ? (
              <p className="absolute inset-x-0 bottom-0 bg-ink/80 px-4 py-3 text-sm font-medium text-canvas">
                Uploading…
              </p>
            ) : filling ? (
              <p className="absolute inset-x-0 bottom-0 bg-ink/80 px-4 py-3 text-sm font-medium text-canvas">
                Reading this photo…
              </p>
            ) : null}
            {chosen && chosen.key === coverKey ? (
              <span className="absolute top-3 left-3 rounded-full bg-canvas px-3 py-1 text-xs font-medium">
                Cover
              </span>
            ) : null}
          </div>
          <ul className="grid grid-cols-4 gap-2">
            {slots.map((slot, index) => (
              <li key={slot.key} className="relative">
                <button
                  type="button"
                  onClick={() => setSelectedKey(slot.key)}
                  aria-pressed={slot.key === chosen?.key}
                  aria-label={`Photo ${index + 1}`}
                  className={cn(
                    "block aspect-square w-full bg-soft-cloud",
                    slot.key === chosen?.key && "ring-2 ring-ink ring-offset-2",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={slot.previewUrl} alt="" className="h-full w-full object-cover" />
                </button>
                <button
                  type="button"
                  onClick={() => void removeSlot(slot)}
                  aria-label={`Remove photo ${index + 1}`}
                  className="absolute top-1 right-1 flex size-7 items-center justify-center rounded-full bg-canvas text-ink"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </li>
            ))}
            {slots.length < MAX_PRODUCT_IMAGES ? (
              <li>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex aspect-square w-full flex-col items-center justify-center gap-1 bg-soft-cloud text-xs font-medium text-mute transition hover:text-ink"
                >
                  <ImagePlus className="size-4" aria-hidden />
                  Add
                </button>
              </li>
            ) : null}
          </ul>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="sr-only"
            onChange={(event) => {
              void addFiles(event.target.files);
              event.target.value = "";
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={!chosen?.storageId || filling || saving}
              onClick={() => void fillFromPhoto()}
            >
              {filling ? "Reading…" : "Fill from photo"}
            </Button>
            {chosen && chosen.key !== coverKey ? (
              <Button type="button" variant="secondary" size="sm" onClick={() => makeCover(chosen.key)}>
                Make cover
              </Button>
            ) : null}
          </div>
        </aside>

        <div className="min-w-0 space-y-8">
          <section className="space-y-4">
            <SectionHead title="Basics" hint="What shoppers see first on the product page." />
            <Field label="Name">
              <Input
                required
                maxLength={80}
                value={draft.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Khaki slim trousers"
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Brand">
                <Input
                  maxLength={80}
                  value={draft.brand}
                  onChange={(e) => set("brand", e.target.value)}
                  placeholder="Optional"
                />
              </Field>
              <Field label="Type">
                <select
                  value={draft.productType}
                  onChange={(e) => set("productType", e.target.value)}
                  className="h-12 w-full rounded-full bg-soft-cloud px-4 text-sm outline-none focus:bg-canvas focus:ring-2 focus:ring-ink"
                >
                  <option value="">Choose a type</option>
                  {draft.productType && !knownTypes.includes(draft.productType) ? (
                    <option value={draft.productType}>{productTypeLabel(draft.productType)}</option>
                  ) : null}
                  {knownTypes.map((type) => (
                    <option key={type} value={type}>
                      {productTypeLabel(type)}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Description" hint={`${draft.description.length}/400`}>
              <Textarea
                rows={4}
                maxLength={400}
                value={draft.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="Fit, fabric, and how to wear it."
              />
            </Field>
          </section>

          <section className="space-y-4 border-t border-hairline pt-8">
            <SectionHead title="Classification" hint="Category tree and who this piece is for." />
            <CategoryTreePicker
              value={draft.categoryId}
              onChange={(pick) => {
                if (!pick) {
                  setDraft((prev) => ({ ...prev, categoryId: null }));
                  return;
                }
                setDraft((prev) => {
                  const nextType =
                    pick.productTypeHint && isProductType(pick.legacyCategory, pick.productTypeHint)
                      ? pick.productTypeHint
                      : isProductType(pick.legacyCategory, prev.productType)
                        ? prev.productType
                        : "";
                  return {
                    ...prev,
                    categoryId: pick.categoryId,
                    category: pick.legacyCategory,
                    productType: nextType,
                    subcategory: pick.name,
                  };
                });
              }}
            />
            <ChoiceGroup
              legend="Audience"
              value={draft.presentation}
              onChange={(next) => set("presentation", next as Presentation)}
              options={AUDIENCE}
            />
            <div className="grid gap-6 sm:grid-cols-2">
              <ChoiceGroup
                legend="Age"
                value={draft.ageGroup}
                onChange={(next) => set("ageGroup", next as AgeGroup | "")}
                options={AGE_GROUPS.map((item) => ({ value: item, label: AGE_GROUP_LABELS[item] }))}
                clearable
              />
              <ChoiceGroup
                legend="Occasion"
                value={draft.occasion}
                onChange={(next) => set("occasion", next as Occasion | "")}
                options={OCCASIONS.map((item) => ({ value: item, label: OCCASION_LABELS[item] }))}
                clearable
              />
            </div>
          </section>

          <section className="space-y-4 border-t border-hairline pt-8">
            <SectionHead title="Attributes" hint="Helps search and outfit matching." />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Primary colour">
                <Input
                  maxLength={40}
                  value={draft.colourPrimary}
                  onChange={(e) => set("colourPrimary", e.target.value)}
                  placeholder="Khaki"
                />
              </Field>
              <Field label="Colour hex">
                <span className="flex gap-2">
                  <input
                    type="color"
                    aria-label="Pick a colour"
                    value={/^#[0-9a-fA-F]{6}$/.test(draft.colourHex) ? draft.colourHex : "#111111"}
                    onChange={(e) => set("colourHex", e.target.value)}
                    className="h-12 w-14 shrink-0 rounded-full bg-soft-cloud"
                  />
                  <Input
                    value={draft.colourHex}
                    onChange={(e) => set("colourHex", e.target.value)}
                    placeholder="#c4a574"
                    maxLength={7}
                  />
                </span>
              </Field>
              <Field label="Other colours">
                <Input
                  value={draft.colourSecondary}
                  onChange={(e) => set("colourSecondary", e.target.value)}
                  placeholder="navy, white"
                />
              </Field>
              <Field label="Pattern">
                <Input
                  maxLength={40}
                  value={draft.pattern}
                  onChange={(e) => set("pattern", e.target.value)}
                  placeholder="solid, stripe, check"
                />
              </Field>
              <Field label="Material">
                <Input
                  maxLength={60}
                  value={draft.material}
                  onChange={(e) => set("material", e.target.value)}
                  placeholder="Cotton twill"
                />
              </Field>
              <Field label="One-size note" hint="Only if this piece has no size variants.">
                <Input
                  maxLength={24}
                  value={draft.size}
                  onChange={(e) => set("size", e.target.value)}
                  placeholder="One size"
                />
              </Field>
            </div>
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">Custom attributes</p>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    set(
                      "customAttributes",
                      [
                        ...draft.customAttributes,
                        { key: "", keyInput: "", label: "", value: "" },
                      ],
                    )
                  }
                >
                  <Plus className="size-3.5" aria-hidden />
                  Add
                </Button>
              </div>
              {draft.customAttributes.length === 0 ? (
                <p className="text-xs text-mute">Optional. Add neckline, SPF, frame shape, or any trait.</p>
              ) : (
                <ul className="space-y-3">
                  {draft.customAttributes.map((row, index) => (
                    <li key={`attr-${index}`} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                      <Input
                        value={row.keyInput}
                        onChange={(e) => {
                          const keyInput = e.target.value;
                          set(
                            "customAttributes",
                            draft.customAttributes.map((item, i) =>
                              i === index
                                ? {
                                    ...item,
                                    keyInput,
                                    label: item.label || attrLabel(keyInput.trim().toLowerCase().replace(/\s+/g, "_")),
                                  }
                                : item,
                            ),
                          );
                        }}
                        placeholder="Key (e.g. neckline)"
                        maxLength={40}
                      />
                      <Input
                        value={row.value}
                        onChange={(e) =>
                          set(
                            "customAttributes",
                            draft.customAttributes.map((item, i) =>
                              i === index ? { ...item, value: e.target.value } : item,
                            ),
                          )
                        }
                        placeholder="Value"
                        maxLength={120}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Remove attribute"
                        onClick={() =>
                          set(
                            "customAttributes",
                            draft.customAttributes.filter((_, i) => i !== index),
                          )
                        }
                      >
                        <X className="size-3.5" aria-hidden />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="space-y-4 border-t border-hairline pt-8">
            <div className="flex items-start justify-between gap-3">
              <SectionHead
                title="Product information"
                hint="Accordion sections on the product page. Add, rename, or remove freely."
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={draft.infoSections.length >= MAX_INFO_SECTIONS}
                onClick={() => set("infoSections", [...draft.infoSections, newInfoSection()])}
              >
                <Plus className="size-3.5" aria-hidden />
                Section
              </Button>
            </div>
            <ul className="space-y-6">
              {draft.infoSections.map((section, index) => (
                <li key={section.id} className="space-y-3 border border-hairline p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      value={section.title}
                      onChange={(e) =>
                        set(
                          "infoSections",
                          draft.infoSections.map((item, i) =>
                            i === index ? { ...item, title: e.target.value } : item,
                          ),
                        )
                      }
                      placeholder="Section title"
                      maxLength={80}
                      className="min-w-0 flex-1"
                    />
                    <select
                      value={section.kind}
                      onChange={(e) =>
                        set(
                          "infoSections",
                          draft.infoSections.map((item, i) =>
                            i === index
                              ? { ...item, kind: e.target.value as InfoSectionKind }
                              : item,
                          ),
                        )
                      }
                      className="h-12 rounded-full bg-soft-cloud px-4 text-sm outline-none focus:bg-canvas focus:ring-2 focus:ring-ink"
                    >
                      <option value="rich_text">Text</option>
                      <option value="key_value">Key / value</option>
                      <option value="faq">FAQ</option>
                    </select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Remove section"
                      onClick={() =>
                        set(
                          "infoSections",
                          draft.infoSections.filter((_, i) => i !== index),
                        )
                      }
                    >
                      <X className="size-3.5" aria-hidden />
                    </Button>
                  </div>
                  {section.kind === "rich_text" ? (
                    <Textarea
                      rows={4}
                      maxLength={4000}
                      value={section.body}
                      onChange={(e) =>
                        set(
                          "infoSections",
                          draft.infoSections.map((item, i) =>
                            i === index ? { ...item, body: e.target.value } : item,
                          ),
                        )
                      }
                      placeholder="Details shoppers see when they expand this section."
                    />
                  ) : (
                    <div className="space-y-2">
                      {section.rows.map((row, rowIndex) => (
                        <div key={`${section.id}-row-${rowIndex}`} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                          <Input
                            value={row.label}
                            onChange={(e) =>
                              set(
                                "infoSections",
                                draft.infoSections.map((item, i) => {
                                  if (i !== index) return item;
                                  const rows = item.rows.map((entry, j) =>
                                    j === rowIndex ? { ...entry, label: e.target.value } : entry,
                                  );
                                  return { ...item, rows };
                                }),
                              )
                            }
                            placeholder={section.kind === "faq" ? "Question" : "Label"}
                          />
                          <Input
                            value={row.value}
                            onChange={(e) =>
                              set(
                                "infoSections",
                                draft.infoSections.map((item, i) => {
                                  if (i !== index) return item;
                                  const rows = item.rows.map((entry, j) =>
                                    j === rowIndex ? { ...entry, value: e.target.value } : entry,
                                  );
                                  return { ...item, rows };
                                }),
                              )
                            }
                            placeholder={section.kind === "faq" ? "Answer" : "Value"}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Remove row"
                            onClick={() =>
                              set(
                                "infoSections",
                                draft.infoSections.map((item, i) =>
                                  i === index
                                    ? { ...item, rows: item.rows.filter((_, j) => j !== rowIndex) }
                                    : item,
                                ),
                              )
                            }
                          >
                            <X className="size-3.5" aria-hidden />
                          </Button>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          set(
                            "infoSections",
                            draft.infoSections.map((item, i) =>
                              i === index
                                ? { ...item, rows: [...item.rows, { label: "", value: "" }] }
                                : item,
                            ),
                          )
                        }
                      >
                        <Plus className="size-3.5" aria-hidden />
                        Row
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-4 border-t border-hairline pt-8">
            <SectionHead title="Pricing" hint="Base price for the product. Variants can override." />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Price (INR)">
                <Input
                  type="number"
                  required
                  min={0}
                  step={1}
                  value={draft.priceInr}
                  onChange={(e) => set("priceInr", e.target.value)}
                  placeholder="2499"
                />
              </Field>
              <Field label="Compare-at (INR)" hint="Shown struck through when higher than price.">
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={draft.compareAtPriceInr}
                  onChange={(e) => set("compareAtPriceInr", e.target.value)}
                />
              </Field>
            </div>
            <label className="flex cursor-pointer items-start gap-3 rounded-none border border-hairline px-4 py-3">
              <input
                type="checkbox"
                className="mt-1 size-4 accent-ink"
                checked={draft.aiRecommend}
                disabled={locked}
                onChange={(e) => setDraft((current) => ({ ...current, aiRecommend: e.target.checked }))}
              />
              <span className="min-w-0 space-y-0.5">
                <span className="block text-sm font-medium text-ink">Recommend by AI</span>
                <span className="block text-xs text-mute">
                  When this product is live, the stylist can suggest it in shop looks. Embeddings update on save
                  and publish.
                </span>
              </span>
            </label>
          </section>

          <section className="space-y-4 border-t border-hairline pt-8">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <SectionHead
                title="Variants & stock"
                hint="Enable Size / Colour, then set stock per SKU. Manage the option lists in Variants."
              />
              <div className="flex flex-wrap gap-2">
                <Button href={routes.vendorVariants} variant="ghost" size="sm">
                  Manage options
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={locked || enabledTypes.length === 0}
                  onClick={fillAllCombinations}
                >
                  Fill combinations
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={locked}
                  onClick={() => set("variants", [...draft.variants, newVariant()])}
                >
                  <Plus />
                  Add row
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Option dimensions</p>
              {catalog === undefined || seedingCatalog ? (
                <p className="text-sm text-mute">Loading size and colour options…</p>
              ) : catalog.length === 0 ? (
                <p className="text-sm text-mute">No variant catalog yet. Refresh after seeding completes.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {catalog.map((type) => {
                    const selected = draft.variantTypeIds.includes(type.id);
                    return (
                      <button
                        key={type.id}
                        type="button"
                        disabled={locked}
                        aria-pressed={selected}
                        onClick={() => toggleVariantType(type.id)}
                        className={cn(
                          "inline-flex h-10 items-center rounded-full px-4 text-sm font-medium transition active:scale-95 active:opacity-50 disabled:opacity-40",
                          selected ? "bg-ink text-canvas" : "bg-canvas text-ink ring-1 ring-inset ring-hairline",
                        )}
                      >
                        {type.label}
                        <span className={cn("ml-1.5", selected ? "text-canvas/70" : "text-mute")}>
                          {type.options.length}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-sm">
                <thead>
                  <tr className="text-left text-xs text-mute">
                    {enabledTypes.length > 0 ? (
                      enabledTypes.map((type) => (
                        <th key={type.id} className="py-2 pr-2 font-medium">
                          {type.label}
                        </th>
                      ))
                    ) : (
                      <>
                        <th className="py-2 pr-2 font-medium">Size</th>
                        <th className="py-2 pr-2 font-medium">Colour</th>
                        <th className="py-2 pr-2 font-medium">Hex</th>
                      </>
                    )}
                    <th className="py-2 pr-2 font-medium">Price</th>
                    <th className="py-2 pr-2 font-medium">Stock</th>
                    <th className="py-2 pr-2 font-medium">Active</th>
                    <th className="py-2 font-medium" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {draft.variants.map((row, index) => {
                    const patch = (changes: Partial<VariantRow>) =>
                      set(
                        "variants",
                        draft.variants.map((item) => (item.key === row.key ? { ...item, ...changes } : item)),
                      );
                    return (
                      <tr key={row.key}>
                        {enabledTypes.length > 0 ? (
                          enabledTypes.map((type) => {
                            const selected =
                              row.optionIds.find((id) => optionById(catalog ?? [], id)?.variantTypeId === type.id) ??
                              "";
                            return (
                              <td key={type.id} className="py-2 pr-2">
                                <select
                                  value={selected}
                                  disabled={locked}
                                  aria-label={`${type.label} for option ${index + 1}`}
                                  onChange={(e) => setRowOption(row.key, type, e.target.value)}
                                  className="h-10 w-full min-w-[6.5rem] rounded-full bg-soft-cloud px-3 text-sm outline-none focus:bg-canvas focus:ring-2 focus:ring-ink disabled:opacity-40"
                                >
                                  <option value="">Choose…</option>
                                  {type.options.map((option) => (
                                    <option key={option.id} value={option.id}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                              </td>
                            );
                          })
                        ) : (
                          <>
                            <td className="py-2 pr-2">
                              <Input
                                className="h-10"
                                placeholder="M"
                                value={row.size}
                                onChange={(e) => patch({ size: e.target.value })}
                              />
                            </td>
                            <td className="py-2 pr-2">
                              <Input
                                className="h-10"
                                placeholder="Oat"
                                value={row.colourName}
                                onChange={(e) => patch({ colourName: e.target.value })}
                              />
                            </td>
                            <td className="py-2 pr-2">
                              <Input
                                className="h-10"
                                placeholder="#d8cbb4"
                                maxLength={7}
                                value={row.colourHex}
                                onChange={(e) => patch({ colourHex: e.target.value })}
                              />
                            </td>
                          </>
                        )}
                        <td className="py-2 pr-2">
                          <Input
                            className="h-10"
                            type="number"
                            min={0}
                            placeholder={draft.priceInr || "—"}
                            value={row.priceInr}
                            onChange={(e) => patch({ priceInr: e.target.value })}
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <Input
                            className="h-10"
                            type="number"
                            min={0}
                            value={row.stock}
                            onChange={(e) => patch({ stock: e.target.value })}
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            type="checkbox"
                            checked={row.active}
                            onChange={(e) => patch({ active: e.target.checked })}
                            className="size-5 accent-ink"
                            aria-label={`Option ${index + 1} active`}
                          />
                        </td>
                        <td className="py-2 text-right">
                          <button
                            type="button"
                            disabled={draft.variants.length === 1 || locked}
                            onClick={() => set("variants", draft.variants.filter((item) => item.key !== row.key))}
                            aria-label={`Remove option ${index + 1}`}
                            className="flex size-9 items-center justify-center rounded-full bg-soft-cloud disabled:opacity-40"
                          >
                            <X className="size-4" aria-hidden />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {error ? <p className="text-sm text-sale">{error}</p> : null}
          </section>
        </div>
        </div>
      </div>

      <div className="shrink-0 border-t border-hairline bg-canvas px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-mute">
            {uploading ? "Uploading photos…" : saving ? "Saving…" : "Changes save when you press Save."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button href={routes.vendorProducts} variant="ghost" size="sm">
              Cancel
            </Button>
            <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => void save()}>
              {saving ? "Saving…" : "Save"}
            </Button>
            {product?.status !== "active" ? (
              <Button
                type="button"
                size="sm"
                disabled={busy || me.vendor.status !== "active"}
                onClick={() => void saveAndPublish()}
              >
                Publish
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionHead({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="space-y-0.5">
      <h3 className="text-sm font-medium tracking-tight text-ink">{title}</h3>
      {hint ? <p className="text-xs text-mute">{hint}</p> : null}
    </div>
  );
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block space-y-1 text-sm font-medium">
      {label}
      {children}
      {hint ? <span className="block text-xs font-normal text-mute">{hint}</span> : null}
    </label>
  );
}

function ChoiceGroup({
  legend,
  value,
  onChange,
  options,
  clearable,
}: {
  legend: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
  clearable?: boolean;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(selected && clearable ? "" : option.value)}
              className={cn(
                "inline-flex h-10 items-center rounded-full px-4 text-sm font-medium transition active:scale-95 active:opacity-50",
                selected ? "bg-ink text-canvas" : "bg-canvas text-ink ring-1 ring-inset ring-hairline",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
