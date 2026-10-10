"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { ArrowLeft, ImagePlus, Layers, Plus, Tags, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useForm, useFormState, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { FunctionReturnType } from "convex/server";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  categoryScopeMatches,
  type CategoryTreeNode,
} from "@convex/shared/categories";
import { COLOUR_HEX } from "@convex/shared/variants";
import {
  MAX_INFO_SECTIONS,
  MAX_PRODUCT_IMAGES,
  productTypeLabel,
  type InfoSectionKind,
} from "@convex/shared/products";
import type { Presentation } from "@convex/shared/wardrobe";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CategoryTreePicker } from "@/components/vendor/CategoryTreePicker";
import { BrandPicker } from "@/components/vendor/BrandPicker";
import { useVendor } from "@/components/vendor/VendorDesk";
import { useUpload } from "@/hooks/use-upload";
import { reportError } from "@/lib/client-errors";
import { cn } from "@/lib/cn";
import { formatInr } from "@/lib/format";
import {
  aiRecommendReadiness,
  firstFormError,
  productFormSchema,
  type ProductFormValues,
} from "@/lib/product-form-schema";
import {
  resolvePhotoFill,
  type PhotoFillSuggestion,
} from "@convex/shared/productPhotoFill";
import { routes } from "@/lib/routes";

type EditorSection =
  | "basics"
  | "classification"
  | "attributes"
  | "info"
  | "pricing"
  | "variants";

/** First viewport on create — keep Pricing/Stock collapsed until Basics + Category are done. */
const CREATE_OPEN_SECTIONS: EditorSection[] = ["basics", "classification"];

function sectionsForFormErrors(errors: Record<string, unknown>): EditorSection[] {
  const open: EditorSection[] = [];
  if (errors.name || errors.brand || errors.brandId || errors.description) {
    open.push("basics");
  }
  if (errors.categoryId || errors.category || errors.productType) {
    open.push("classification");
  }
  if (errors.attributeSelections) open.push("attributes");
  if (errors.infoSections) open.push("info");
  if (errors.priceInr || errors.aiRecommend) open.push("pricing");
  if (errors.variants || errors.variantCategoryIds) open.push("variants");
  return open;
}

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Hidden catalog field — derived from category path, not shown in the form. */
function presentationFromPath(path: string | undefined): Presentation {
  const root = path?.split("/")[0];
  if (root === "men") return "masculine";
  if (root === "women") return "feminine";
  return "neutral";
}

type Slot = { key: string; storageId?: Id<"_storage">; previewUrl: string; uploading: boolean };

type VariantRow = ProductFormValues["variants"][number];
type InfoRow = ProductFormValues["infoSections"][number];
type Draft = ProductFormValues;

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
    attributeIds: [],
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
  brandId: null,
  brand: "",
  productType: "",
  subcategory: "",
  description: "",
  category: "clothes",
  categoryId: null,
  presentation: "neutral",
  attributeSelections: [],
  infoSections: [],
  priceInr: "",
  variantCategoryIds: [],
  variants: [newVariant()],
  aiRecommend: false,
};

type ProductView = NonNullable<FunctionReturnType<typeof api.vendorProducts.get>>;
type VariantCatalog = FunctionReturnType<typeof api.variants.catalog>;
type CatalogType = VariantCatalog[number];
type CatalogOption = CatalogType["options"][number];

function initialOpenSections(product: ProductView | null): EditorSection[] {
  if (!product) return [...CREATE_OPEN_SECTIONS];
  const open: EditorSection[] = ["basics", "classification", "pricing", "variants"];
  if ((product.attributeSelections?.length ?? 0) > 0) open.push("attributes");
  if ((product.infoSections?.length ?? 0) > 0) open.push("info");
  return open;
}

/** Collapse identical SKU combinations (same attributeIds). */
function dedupeVariantRows(rows: VariantRow[]): VariantRow[] {
  const seen = new Set<string>();
  const out: VariantRow[] = [];
  for (const row of rows) {
    const key =
      row.attributeIds.length > 0
        ? [...row.attributeIds].sort().join("|")
        : `empty:${row.key}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out.length > 0 ? out : [newVariant()];
}

function optionById(catalog: VariantCatalog, optionId: string): CatalogOption | undefined {
  for (const type of catalog) {
    const match = type.options.find((option) => option.id === optionId);
    if (match) return match;
  }
  return undefined;
}

/** Variant scoped to a parent (e.g. Shirts) also matches product leaf (e.g. Formal). */
function variantTypeMatchesCategory(
  type: Pick<CatalogType, "categoryIds">,
  categoryId: Id<"categories"> | null | undefined,
  tree: CategoryTreeNode[],
): boolean {
  return categoryScopeMatches(categoryId, type.categoryIds, tree);
}

/** Keep free-text size/colour in sync with selected catalog options. */
function labelsFromOptions(
  catalog: VariantCatalog,
  attributeIds: string[],
): Pick<VariantRow, "size" | "colourName" | "colourHex"> {
  let size = "";
  let colourName = "";
  let colourHex = "";
  for (const attributeId of attributeIds) {
    const option = optionById(catalog, attributeId);
    if (!option) continue;
    const type = catalog.find((row) => row.id === option.variantCategoryId);
    if (!type) continue;
    if (type.attributeTypeSlug === "size") size = option.label;
    if (type.attributeTypeSlug === "colour" || type.attributeTypeSlug === "color") {
      colourName = option.label;
      colourHex = option.hex ?? COLOUR_HEX[option.value] ?? colourHex;
    }
  }
  return { size, colourName, colourHex };
}

function draftFrom(product: ProductView): Draft {
  const infoSections = product.infoSections
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((section) => ({
      id: section.id,
      title: section.title,
      kind: section.kind,
      body: section.body ?? "",
      rows: (section.rows ?? []).map((row) => ({ label: row.label, value: row.value })),
    }));

  const attributeSelections = (product.attributeSelections ?? []).map((row) => ({
    attributeTypeId: row.attributeTypeId as string,
    attributeIds: row.attributeIds.map((id) => id as string),
  }));

  return {
    name: product.name,
    brandId: product.brandId,
    brand: product.brand ?? "",
    productType: product.productType ?? "",
    subcategory: product.subcategory,
    description: product.description,
    category: product.category,
    categoryId: product.categoryId,
    presentation: product.presentation,
    attributeSelections,
    infoSections,
    priceInr: String(product.priceInr),
    variantCategoryIds: product.variantCategoryIds,
    aiRecommend: product.aiRecommend,
    variants: product.variants.length
      ? product.variants.map((variant) => ({
          key: variant.id,
          id: variant.id,
          attributeIds: variant.attributeIds,
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
  const catalog = useQuery(api.variants.catalog, {});
  const categoryTree = useQuery(api.categories.tree, { activeOnly: true });
  const attributeTypes = useQuery(api.attributes.listTypes, { activeOnly: true });
  const brands = useQuery(api.brands.list, { activeOnly: true });
  /** Unscoped catalog for photo-fill matching (before a category is chosen). */
  const attributesCatalog = useQuery(api.attributes.list, { activeOnly: true });
  const describe = useAction(api.ai.openai.describeProduct);
  const ensureBrand = useMutation(api.brands.ensure);
  const { upload } = useUpload("vendor");

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: product ? draftFrom(product) : EMPTY,
    mode: "onSubmit",
    reValidateMode: "onChange",
  });
  const draft = (useWatch({ control: form.control }) ?? form.getValues()) as ProductFormValues;
  /** Dedicated watch so Variants UI updates when Classification changes. */
  const watchedCategoryId = useWatch({ control: form.control, name: "categoryId" });
  const productCategoryId = (watchedCategoryId ?? draft.categoryId) as Id<"categories"> | null;
  const allAttributes = useQuery(api.attributes.list, {
    categoryId: productCategoryId ?? undefined,
    activeOnly: true,
  });
  const { errors, isSubmitted } = useFormState({ control: form.control });

  const categoryNodes = useMemo(
    () => (categoryTree ? (categoryTree as CategoryTreeNode[]) : []),
    [categoryTree],
  );

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
  const [error, setError] = useState<string | null>(null);
  const [photoSuggestions, setPhotoSuggestions] = useState<PhotoFillSuggestion[]>([]);
  const [openSections, setOpenSections] = useState<EditorSection[]>(() =>
    initialOpenSections(product),
  );
  const fileRef = useRef<HTMLInputElement>(null);
  /** Skip auto Size/Colour enable when editing an existing product. */
  const defaultedTypes = useRef(Boolean(product));
  const locked = me.vendor.status === "suspended" || me.vendor.status === "closed";

  const ensureSectionsOpen = (sections: EditorSection[]) => {
    if (sections.length === 0) return;
    setOpenSections((current) => {
      const next = new Set(current);
      for (const section of sections) next.add(section);
      return [...next];
    });
  };

  const set = <K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) => {
    form.setValue(key, value as never, { shouldDirty: true, shouldValidate: isSubmitted });
  };

  const setDraft = (updater: ProductFormValues | ((current: ProductFormValues) => ProductFormValues)) => {
    const current = form.getValues();
    const next = typeof updater === "function" ? updater(current) : updater;
    (Object.keys(next) as (keyof ProductFormValues)[]).forEach((key) => {
      form.setValue(key, next[key] as never, { shouldDirty: true, shouldValidate: isSubmitted });
    });
  };

  // Drop stale/orphan variant + attribute ids that are not in this store's catalog,
  // and drop variants that don't match the selected product category.
  useEffect(() => {
    if (!catalog?.length || categoryTree === undefined) return;
    const allowedTypes = new Set(
      catalog
        .filter((type) => variantTypeMatchesCategory(type, productCategoryId, categoryNodes))
        .map((type) => type.id as string),
    );
    const allowedOptions = new Set(
      catalog
        .filter((type) => allowedTypes.has(type.id as string))
        .flatMap((type) => type.options.map((option) => option.id as string)),
    );
    setDraft((current) => {
      const variantCategoryIds = current.variantCategoryIds.filter((id) => allowedTypes.has(id));
      let variantsChanged = false;
      const variants = current.variants.map((row) => {
        const attributeIds = row.attributeIds.filter((id) => allowedOptions.has(id));
        if (attributeIds.length === row.attributeIds.length) return row;
        variantsChanged = true;
        return {
          ...row,
          attributeIds,
          ...labelsFromOptions(catalog, attributeIds),
        };
      });
      const deduped = dedupeVariantRows(variants);
      const dedupedChanged = deduped.length !== current.variants.length;
      if (
        variantCategoryIds.length === current.variantCategoryIds.length &&
        !variantsChanged &&
        !dedupedChanged
      ) {
        return current;
      }
      return { ...current, variantCategoryIds, variants: deduped };
    });
  }, [catalog, categoryNodes, categoryTree, productCategoryId]);

  /** Variants linked to this product's category (including parent-scoped Variants). */
  const sortedCatalog = useMemo(() => {
    if (!catalog || categoryTree === undefined) return [];
    return catalog
      .filter((type) => variantTypeMatchesCategory(type, productCategoryId, categoryNodes))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [catalog, categoryNodes, categoryTree, productCategoryId]);

  const enabledTypes = useMemo(() => {
    return sortedCatalog.filter((type) => draft.variantCategoryIds.includes(type.id));
  }, [sortedCatalog, draft.variantCategoryIds]);

  const MAX_VARIANT_COMBO_ROWS = 48;

  /** One SKU row per combination of enabled dimension options (capped). Keeps stock/price when ids match. */
  function buildCombinationRows(
    catalogRows: VariantCatalog,
    types: CatalogType[],
    previous: VariantRow[] = [],
  ): VariantRow[] | null {
    if (types.length === 0) return [newVariant()];
    const lists = types.map((type) => type.options);
    if (lists.some((list) => list.length === 0)) return null;

    let combos: CatalogOption[][] = [[]];
    for (const options of lists) {
      const next: CatalogOption[][] = [];
      for (const prefix of combos) {
        for (const option of options) {
          next.push([...prefix, option]);
          if (next.length >= MAX_VARIANT_COMBO_ROWS) break;
        }
        if (next.length >= MAX_VARIANT_COMBO_ROWS) break;
      }
      combos = next;
    }

    const prevByKey = new Map(
      previous.map((row) => {
        const key = [...row.attributeIds].sort().join("|");
        return [key, row] as const;
      }),
    );

    return dedupeVariantRows(
      combos.map((picked) => {
        const attributeIds = picked.map((option) => option.id);
        const key = [...attributeIds].sort().join("|");
        const prior = prevByKey.get(key);
        return {
          ...(prior ?? newVariant()),
          key: prior?.key ?? crypto.randomUUID(),
          id: prior?.id,
          attributeIds,
          ...labelsFromOptions(catalogRows, attributeIds),
          stock: prior?.stock ?? "0",
          priceInr: prior?.priceInr ?? "",
          active: prior?.active ?? true,
        };
      }),
    );
  }

  // New products: turn on Size + Colour dimensions only — do not explode every combination.
  useEffect(() => {
    if (product || !catalog?.length || defaultedTypes.current || categoryTree === undefined) return;
    if (!productCategoryId) return;
    defaultedTypes.current = true;
    const defaults = catalog.filter(
      (type) =>
        (type.attributeTypeSlug === "size" ||
          type.attributeTypeSlug === "colour" ||
          type.attributeTypeSlug === "color") &&
        variantTypeMatchesCategory(type, productCategoryId, categoryNodes),
    );
    if (defaults.length === 0) return;
    setDraft((current) => {
      if (current.variantCategoryIds.length > 0) return current;
      return {
        ...current,
        variantCategoryIds: defaults.map((type) => type.id as string),
        variants: current.variants.length > 0 ? current.variants : [newVariant()],
      };
    });
  }, [catalog, categoryNodes, categoryTree, product, productCategoryId]);

  /** Toggle dimensions without generating the cartesian product. */
  function setVariantCategoryIds(nextIds: string[]) {
    if (!catalog) {
      set("variantCategoryIds", nextIds);
      return;
    }
    const enabled = new Set(nextIds);
    const allowedOptionIds = new Set(
      catalog
        .filter((type) => enabled.has(type.id as string))
        .flatMap((type) => type.options.map((option) => option.id as string)),
    );
    setDraft((current) => {
      const variants = current.variants.map((row) => {
        const attributeIds = row.attributeIds.filter((id) => allowedOptionIds.has(id));
        if (attributeIds.length === row.attributeIds.length) return row;
        return {
          ...row,
          attributeIds,
          ...labelsFromOptions(catalog, attributeIds),
        };
      });
      return {
        ...current,
        variantCategoryIds: nextIds,
        variants: variants.length > 0 ? variants : [newVariant()],
      };
    });
  }

  function setRowOption(rowKey: string, type: CatalogType, optionId: string) {
    if (!catalog) return;
    setDraft((current) => ({
      ...current,
      variants: current.variants.map((row) => {
        if (row.key !== rowKey) return row;
        const known = row.attributeIds.filter((id) => Boolean(optionById(catalog, id)));
        const withoutType = known.filter((id) => {
          const option = optionById(catalog, id);
          return option?.variantCategoryId !== type.id;
        });
        const attributeIds = optionId ? [...withoutType, optionId] : withoutType;
        return {
          ...row,
          attributeIds,
          ...labelsFromOptions(catalog, attributeIds),
        };
      }),
    }));
  }

  /** Explicitly build every combination of enabled dimensions (capped). */
  function fillAllCombinations() {
    if (!catalog || enabledTypes.length === 0) return;
    const comboCount = enabledTypes.reduce((n, type) => n * Math.max(1, type.options.length), 1);
    if (comboCount > MAX_VARIANT_COMBO_ROWS) {
      const ok = window.confirm(
        `That would create ${comboCount} SKUs (capped at ${MAX_VARIANT_COMBO_ROWS}). Continue?`,
      );
      if (!ok) return;
    } else if (comboCount > 12) {
      const labels = enabledTypes.map((type) => type.label).join(" × ");
      const ok = window.confirm(`Generate all ${comboCount} ${labels} combinations as SKU rows?`);
      if (!ok) return;
    }
    const rows = buildCombinationRows(catalog, enabledTypes, draft.variants);
    if (rows === null) {
      toast.error("Each enabled dimension needs at least one option.");
      return;
    }
    set("variants", rows);
    toast.success(`Created ${rows.length} SKU row${rows.length === 1 ? "" : "s"}.`);
  }

  function addVariantRow() {
    set("variants", [...draft.variants, newVariant()]);
  }

  const chosen = slots.find((slot) => slot.key === selectedKey) ?? slots[0] ?? null;
  const uploading = slots.some((slot) => slot.uploading);
  const hasEmbedImage = slots.some((slot) => Boolean(slot.storageId) && !slot.uploading);
  const aiReady = useMemo(
    () =>
      aiRecommendReadiness({
        name: draft.name,
        description: draft.description,
        priceInr: draft.priceInr,
        hasImage: hasEmbedImage,
        hasAttributes: draft.attributeSelections.some((row) => row.attributeIds.length > 0),
      }),
    [draft.name, draft.description, draft.priceInr, draft.attributeSelections, hasEmbedImage],
  );

  const attributesByType = useMemo(() => {
    const map = new Map<string, NonNullable<typeof allAttributes>>();
    for (const row of allAttributes ?? []) {
      const list = map.get(row.attributeTypeId) ?? [];
      list.push(row);
      map.set(row.attributeTypeId, list);
    }
    return map;
  }, [allAttributes]);

  const unusedAttributeTypes = useMemo(() => {
    const used = new Set(draft.attributeSelections.map((row) => row.attributeTypeId));
    return (attributeTypes ?? []).filter((type) => type.isActive && !used.has(type._id));
  }, [attributeTypes, draft.attributeSelections]);

  // Drop the flag if the listing no longer has enough style signal to embed.
  useEffect(() => {
    if (!draft.aiRecommend || aiReady.ready) return;
    form.setValue("aiRecommend", false, { shouldDirty: true });
  }, [aiReady.ready, draft.aiRecommend, form]);

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
      const resolved = resolvePhotoFill({
        draft: {
          name: result.name,
          brand: result.brand,
          subcategory: result.subcategory,
          productType: result.productType,
          description: result.description,
          category: result.category,
          presentation: result.presentation || "neutral",
          colours: result.colours,
          size: result.size,
          ageGroup: result.ageGroup,
          occasion: result.occasion,
        },
        brands: (brands ?? []).map((row) => ({
          _id: row._id,
          name: row.name,
          slug: row.slug,
        })),
        categoryTree: categoryNodes,
        attributeTypes: (attributeTypes ?? []).map((row) => ({
          _id: row._id,
          label: row.label,
          displayLabel: row.displayLabel,
          slug: row.slug,
        })),
        attributes: (attributesCatalog ?? []).map((row) => ({
          _id: row._id,
          attributeTypeId: row.attributeTypeId,
          label: row.label,
          value: row.value,
          slug: row.slug,
          hex: row.hex,
        })),
      });

      setDraft((current) => {
        const mergedSelections = [...resolved.attributeSelections];
        for (const row of current.attributeSelections) {
          if (!mergedSelections.some((item) => item.attributeTypeId === row.attributeTypeId)) {
            mergedSelections.push(row);
          }
        }
        return {
          ...current,
          name: resolved.name,
          description: resolved.description,
          brandId: resolved.brandId,
          brand: resolved.brand,
          subcategory: resolved.subcategory,
          productType: resolved.productType,
          category: resolved.category,
          categoryId: resolved.categoryId,
          presentation: resolved.categoryPath
            ? presentationFromPath(resolved.categoryPath)
            : resolved.presentation,
          attributeSelections: mergedSelections,
        };
      });

      setPhotoSuggestions(resolved.suggestions);
      const open: EditorSection[] = ["basics", "classification", "pricing", "variants"];
      if (resolved.attributeSelections.length > 0 || resolved.suggestions.some((s) => s.kind === "attribute")) {
        open.push("attributes");
      }
      ensureSectionsOpen(open);

      const summary = resolved.appliedSummary.join(", ");
      toast.success(
        resolved.suggestions.length > 0
          ? `Filled: ${summary}. Review AI suggestions below.`
          : `Filled: ${summary}. Check price and stock.`,
      );
    } catch (caught) {
      toast.error(reportError(caught).message);
    } finally {
      setFilling(false);
    }
  }

  async function applyPhotoSuggestion(suggestion: PhotoFillSuggestion) {
    if (suggestion.kind === "brand" && suggestion.brandName) {
      try {
        const brandId = await ensureBrand({ name: suggestion.brandName });
        setDraft((current) => ({
          ...current,
          brandId,
          brand: suggestion.brandName ?? current.brand,
        }));
        setPhotoSuggestions((rows) => rows.filter((row) => row.id !== suggestion.id));
        toast.success(`Brand “${suggestion.brandName}” ready.`);
      } catch (caught) {
        toast.error(reportError(caught).message);
      }
      return;
    }
    if (suggestion.kind === "category" && suggestion.category) {
      const pick = suggestion.category;
      setDraft((current) => ({
        ...current,
        categoryId: pick.categoryId,
        category: pick.legacyCategory,
        productType: pick.productTypeHint ?? current.productType,
        subcategory: pick.name,
        presentation: presentationFromPath(pick.path),
      }));
      setPhotoSuggestions((rows) => rows.filter((row) => row.kind !== "category"));
      ensureSectionsOpen(["classification", "pricing", "variants"]);
      toast.success(`Category set to ${pick.path.replace(/\//g, " → ")}.`);
      return;
    }
    if (suggestion.kind === "attribute" && suggestion.attributeTypeId && suggestion.attributeId) {
      setDraft((current) => {
        const existing = current.attributeSelections.find(
          (row) => row.attributeTypeId === suggestion.attributeTypeId,
        );
        if (existing) {
          if (existing.attributeIds.includes(suggestion.attributeId!)) return current;
          return {
            ...current,
            attributeSelections: current.attributeSelections.map((row) =>
              row.attributeTypeId === suggestion.attributeTypeId
                ? { ...row, attributeIds: [...row.attributeIds, suggestion.attributeId!] }
                : row,
            ),
          };
        }
        return {
          ...current,
          attributeSelections: [
            ...current.attributeSelections,
            {
              attributeTypeId: suggestion.attributeTypeId!,
              attributeIds: [suggestion.attributeId!],
            },
          ],
        };
      });
      setPhotoSuggestions((rows) => rows.filter((row) => row.id !== suggestion.id));
      ensureSectionsOpen(["attributes"]);
      return;
    }
    // Notes / unmatched attributes: dismiss and point the vendor at the right section.
    setPhotoSuggestions((rows) => rows.filter((row) => row.id !== suggestion.id));
    if (suggestion.kind === "attribute") ensureSectionsOpen(["attributes"]);
    if (suggestion.kind === "note" && suggestion.label.toLowerCase().includes("occasion")) {
      ensureSectionsOpen(["basics"]);
    }
  }

  function buildArgs(values: ProductFormValues) {
    const price = Number(values.priceInr);
    const subcategory = values.productType
      ? productTypeLabel(values.productType)
      : values.subcategory.trim();
    const attributeSelections = values.attributeSelections
      .filter((row) => row.attributeTypeId && row.attributeIds.length > 0)
      .map((row) => ({
        attributeTypeId: row.attributeTypeId as Id<"attributeTypes">,
        attributeIds: row.attributeIds as Id<"attributes">[],
      }));
    const infoSections = values.infoSections
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
      category: values.category,
      categoryId: (values.categoryId as Id<"categories"> | null) ?? undefined,
      presentation: values.presentation,
      name: values.name.trim(),
      brandId: (values.brandId as Id<"brands"> | null) ?? undefined,
      brand: values.brandId ? undefined : values.brand.trim() || undefined,
      description: values.description.trim(),
      attributeSelections: attributeSelections.length > 0 ? attributeSelections : undefined,
      infoSections: infoSections.length > 0 ? infoSections : undefined,
      subcategory: subcategory || values.category,
      productType: values.productType || undefined,
      priceInr: Math.round(price),
      variantCategoryIds:
        values.variantCategoryIds.length > 0
          ? (values.variantCategoryIds as Id<"variantCategories">[])
          : undefined,
      aiRecommend: values.aiRecommend,
      imageIds: slots.flatMap((slot) => (slot.storageId ? [slot.storageId] : [])),
      variants: (values.variantCategoryIds.length > 0
        ? values.variants
        : values.variants.slice(0, 1)
      ).map((row) => {
        const labels =
          catalog && row.attributeIds.length > 0
            ? labelsFromOptions(catalog, row.attributeIds)
            : { size: "", colourName: "", colourHex: "" };
        const size = labels.size || undefined;
        const colour =
          labels.colourName || /^#[0-9a-fA-F]{6}$/.test(labels.colourHex)
            ? {
                name: labels.colourName,
                hex: /^#[0-9a-fA-F]{6}$/.test(labels.colourHex)
                  ? labels.colourHex.toLowerCase()
                  : "#111111",
              }
            : undefined;
        return {
          id: row.id as Id<"productVariants"> | undefined,
          attributeIds:
            row.attributeIds.length > 0 ? (row.attributeIds as Id<"attributes">[]) : undefined,
          ...(size ? { size } : {}),
          ...(colour ? { colour } : {}),
          priceInr: row.priceInr ? Math.round(Number(row.priceInr)) : undefined,
          stock: Math.max(0, Math.round(Number(row.stock) || 0)),
          active: row.active,
        };
      }),
    };
  }

  async function save(): Promise<Id<"products"> | null> {
    if (saving || uploading) return null;
    setError(null);
    let savedId: Id<"products"> | null = null;
    await form.handleSubmit(
      async (values) => {
        setSaving(true);
        try {
          const args = buildArgs(values);
          if (productId) {
            await update({ productId, ...args });
            toast.success("Saved.");
            savedId = productId;
            return;
          }
          const id = await create(args);
          toast.success("Draft saved.");
          router.replace(routes.vendorProduct(id));
          savedId = id;
        } catch (caught) {
          setError(reportError(caught).message);
        } finally {
          setSaving(false);
        }
      },
      (formErrors) => {
        const message = firstFormError(formErrors) ?? "Fix the highlighted fields.";
        ensureSectionsOpen(sectionsForFormErrors(formErrors as Record<string, unknown>));
        setError(message);
        toast.error(message);
      },
    )();
    return savedId;
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

  const coverKey = slots[0]?.key;
  const status = product?.status;
  const statusText =
    status === "active" ? "Live" : status === "draft" ? "Draft" : status === "archived" ? "Archived" : "New";
  const totalStock = draft.variants.reduce((sum, row) => sum + Math.max(0, Math.round(Number(row.stock) || 0)), 0);
  const displayName = draft.name.trim() || (product ? "Untitled product" : "New product");
  const busy = saving || uploading || locked;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="sticky top-0 z-20 shrink-0 border-b border-border bg-background px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-3">
          <Button href={routes.vendorProducts} variant="ghost" size="icon-sm" aria-label="Back to products">
            <ArrowLeft className="size-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-medium tracking-tight capitalize">{displayName}</h2>
              <Badge
                variant={status === "active" ? "secondary" : "outline"}
                className={cn(status === "active" && "text-success")}
              >
                {statusText}
              </Badge>
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {product?.sku ? `SKU ${product.sku}` : "SKU assigned on save"}
              {" · "}
              {draft.variants.length} SKU{draft.variants.length === 1 ? "" : "s"}
              {" · "}
              <span className={totalStock === 0 ? "text-destructive" : undefined}>{totalStock} in stock</span>
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
        {error ? (
          <Alert variant="destructive" className="mt-2 rounded-none">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {me.vendor.status !== "active" ? (
          <p className="mt-2 text-xs text-muted-foreground">Publishing unlocks once the store is approved.</p>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid items-start gap-8 px-4 py-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        {/* Not sticky: sticky media made Pricing/Stock float beside an empty cover while Basics scrolled away. */}
        <aside className="space-y-3 lg:self-start">
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
                <p className="text-xs text-muted-foreground">First image is the shop cover</p>
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
          <div className="space-y-1.5">
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
            {!chosen?.storageId ? (
              <p className="text-xs text-muted-foreground">
                Add a cover photo first — AI fills name, description, brand, category, and traits.
              </p>
            ) : null}
          </div>
          {photoSuggestions.length > 0 ? (
            <div className="space-y-2 border border-dashed border-border p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">AI suggestions</p>
                  <p className="text-xs text-muted-foreground">
                    Applied what we could match. Use these to finish category, brand, or traits.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setPhotoSuggestions([])}
                >
                  Dismiss
                </Button>
              </div>
              <ul className="space-y-2">
                {photoSuggestions.map((suggestion) => (
                  <li
                    key={suggestion.id}
                    className="flex flex-wrap items-center justify-between gap-2 border border-border px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium capitalize">{suggestion.label}</p>
                      {suggestion.detail ? (
                        <p className="text-xs text-muted-foreground">{suggestion.detail}</p>
                      ) : null}
                    </div>
                    {suggestion.kind === "brand" || suggestion.kind === "category" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => void applyPhotoSuggestion(suggestion)}
                      >
                        {suggestion.kind === "brand" ? "Add brand" : "Use category"}
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => void applyPhotoSuggestion(suggestion)}
                      >
                        Got it
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </aside>

        <div className="min-w-0">
          <Accordion
            multiple
            value={openSections}
            onValueChange={(next) => setOpenSections(next as EditorSection[])}
            className="w-full"
          >
          <AccordionItem value="basics" className="border-border">
            <AccordionTrigger className="items-center rounded-none py-4 hover:no-underline">
              <SectionHead title="Basics" hint="What shoppers see first on the product page." />
            </AccordionTrigger>
            <AccordionContent className="space-y-4 pb-6">
            <EditorField label="Name" error={errors.name?.message}>
              <Input
                maxLength={80}
                value={draft.name}
                aria-invalid={Boolean(errors.name)}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Khaki slim trousers"
              />
            </EditorField>
            <EditorField label="Brand" error={errors.brand?.message}>
              <BrandPicker
                brandId={draft.brandId as Id<"brands"> | null}
                brandName={draft.brand}
                disabled={saving || filling}
                onChange={({ brandId, brandName }) =>
                  setDraft((prev) => ({ ...prev, brandId, brand: brandName }))
                }
              />
            </EditorField>
            <EditorField
              label="Description"
              hint={`${draft.description.length}/400`}
              error={errors.description?.message}
            >
              <Textarea
                rows={4}
                maxLength={400}
                value={draft.description}
                aria-invalid={Boolean(errors.description)}
                onChange={(e) => set("description", e.target.value)}
                placeholder="Fit, fabric, and how to wear it."
              />
            </EditorField>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="classification" className="border-border">
            <AccordionTrigger className="items-center rounded-none py-4 hover:no-underline">
              <SectionHead
                title="Category"
                hint="Pick where this product lives in the catalog. Audience and age belong under Product traits."
                meta={draft.subcategory ? draft.subcategory : undefined}
              />
            </AccordionTrigger>
            <AccordionContent className="space-y-4 pb-6">
            <CategoryTreePicker
              value={draft.categoryId as Id<"categories"> | null}
              onChange={(pick) => {
                if (!pick) {
                  setDraft((prev) => ({
                    ...prev,
                    categoryId: null,
                    productType: "",
                    subcategory: "",
                    presentation: "neutral",
                  }));
                  return;
                }
                setDraft((prev) => ({
                  ...prev,
                  categoryId: pick.categoryId,
                  category: pick.legacyCategory,
                  productType: pick.productTypeHint ?? "",
                  subcategory: pick.name,
                  presentation: presentationFromPath(pick.path),
                }));
                ensureSectionsOpen(["pricing", "variants"]);
              }}
            />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="attributes" className="border-border">
            <AccordionTrigger className="items-center rounded-none py-4 hover:no-underline">
              <SectionHead
                title="Product traits"
                hint="Optional filters and PDP details — not stock. Colour, material, audience, age, and more."
                meta={
                  draft.attributeSelections.length > 0
                    ? `${draft.attributeSelections.length} type${draft.attributeSelections.length === 1 ? "" : "s"}`
                    : "Optional"
                }
              />
            </AccordionTrigger>
            <AccordionContent className="space-y-4 pb-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                Traits describe the product. SKU size/colour options are set under Stock below.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button href={routes.vendorAttributes} variant="ghost" size="sm">
                  Manage catalog
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={unusedAttributeTypes.length === 0}
                  onClick={() => {
                    const first = unusedAttributeTypes[0];
                    if (!first) return;
                    set("attributeSelections", [
                      ...draft.attributeSelections,
                      { attributeTypeId: first._id, attributeIds: [] },
                    ]);
                  }}
                >
                  <Plus className="size-3.5" aria-hidden />
                  Add type
                </Button>
              </div>
            </div>
            {(attributeTypes?.length ?? 0) === 0 ? (
              <Empty className="min-h-0 rounded-none border border-dashed border-border py-8">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Tags />
                  </EmptyMedia>
                  <EmptyTitle>No attribute types yet</EmptyTitle>
                  <EmptyDescription>
                    Create Colour, Material, Audience, and other types in the Attributes desk, then
                    select values here.
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button href={routes.vendorAttributes} size="sm">
                    Open Attributes
                  </Button>
                </EmptyContent>
              </Empty>
            ) : draft.attributeSelections.length === 0 ? (
              <Empty className="min-h-0 rounded-none border border-dashed border-border py-8">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Tags />
                  </EmptyMedia>
                  <EmptyTitle>No traits added</EmptyTitle>
                  <EmptyDescription>
                    Optional. Add a type, then multi-select values shoppers can filter by.
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={unusedAttributeTypes.length === 0}
                    onClick={() => {
                      const first = unusedAttributeTypes[0];
                      if (!first) return;
                      set("attributeSelections", [
                        ...draft.attributeSelections,
                        { attributeTypeId: first._id, attributeIds: [] },
                      ]);
                    }}
                  >
                    <Plus className="size-3.5" aria-hidden />
                    Add type
                  </Button>
                </EmptyContent>
              </Empty>
            ) : (
              <ul className="space-y-4">
                {draft.attributeSelections.map((row, index) => {
                  const type =
                    attributeTypes?.find((item) => item._id === row.attributeTypeId) ?? null;
                  const options = attributesByType.get(row.attributeTypeId) ?? [];
                  const typeChoices = [
                    ...(type ? [type] : []),
                    ...unusedAttributeTypes,
                  ];
                  return (
                    <li key={`${row.attributeTypeId}-${index}`} className="space-y-3 border border-border p-3">
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <EditorField
                            label="Attribute type"
                            error={errors.attributeSelections?.[index]?.attributeTypeId?.message}
                          >
                            <Select
                              value={row.attributeTypeId || null}
                              onValueChange={(next) => {
                                if (!next) return;
                                set(
                                  "attributeSelections",
                                  draft.attributeSelections.map((item, i) =>
                                    i === index
                                      ? { attributeTypeId: next, attributeIds: [] }
                                      : item,
                                  ),
                                );
                              }}
                            >
                              <SelectTrigger className="h-10 w-full rounded-full border-transparent bg-muted px-4 shadow-none">
                                <SelectValue placeholder="Select type">
                                  {type?.displayLabel || type?.label || null}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent className="rounded-none">
                                {typeChoices.map((item) => (
                                  <SelectItem key={item._id} value={item._id}>
                                    {item.displayLabel || item.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </EditorField>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="mt-7"
                          aria-label="Remove attribute type"
                          onClick={() =>
                            set(
                              "attributeSelections",
                              draft.attributeSelections.filter((_, i) => i !== index),
                            )
                          }
                        >
                          <X className="size-3.5" aria-hidden />
                        </Button>
                      </div>
                      {options.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          No values for this type
                          {productCategoryId ? " in the selected category" : ""}. Add them under
                          Attributes.
                        </p>
                      ) : (
                        <ToggleGroup
                          multiple
                          value={row.attributeIds}
                          onValueChange={(next) =>
                            set(
                              "attributeSelections",
                              draft.attributeSelections.map((item, i) =>
                                i === index ? { ...item, attributeIds: next } : item,
                              ),
                            )
                          }
                          spacing={2}
                          className="flex w-full flex-wrap"
                        >
                          {options.map((option) => (
                            <ToggleGroupItem
                              key={option._id}
                              value={option._id}
                              size="sm"
                              className="h-8 rounded-full px-3 aria-pressed:bg-primary aria-pressed:text-primary-foreground"
                            >
                              {option.hex ? (
                                <span
                                  className="size-2.5 shrink-0 rounded-full border border-border"
                                  style={{ backgroundColor: option.hex }}
                                  aria-hidden
                                />
                              ) : null}
                              {option.label}
                            </ToggleGroupItem>
                          ))}
                        </ToggleGroup>
                      )}
                      {errors.attributeSelections?.[index]?.attributeIds?.message ? (
                        <FieldError>
                          {errors.attributeSelections[index].attributeIds.message}
                        </FieldError>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="info" className="border-border">
            <AccordionTrigger className="items-center rounded-none py-4 hover:no-underline">
              <SectionHead
                title="Product information"
                hint="Optional care, FAQ, or other PDP accordion blocks — not catalog attributes."
                meta={
                  draft.infoSections.length > 0
                    ? `${draft.infoSections.length} section${draft.infoSections.length === 1 ? "" : "s"}`
                    : "Optional"
                }
              />
            </AccordionTrigger>
            <AccordionContent className="space-y-4 pb-6">
            {draft.infoSections.length === 0 ? (
              <Empty className="min-h-0 rounded-none border border-dashed border-border py-8">
                <EmptyHeader>
                  <EmptyTitle>No information sections</EmptyTitle>
                  <EmptyDescription>
                    Skip unless the product page needs care instructions, specs, or FAQ.
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={draft.infoSections.length >= MAX_INFO_SECTIONS}
                    onClick={() => set("infoSections", [...draft.infoSections, newInfoSection()])}
                  >
                    <Plus className="size-3.5" aria-hidden />
                    Add section
                  </Button>
                </EmptyContent>
              </Empty>
            ) : (
              <>
                <div className="flex justify-end">
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
                <ul className="space-y-4">
                  {draft.infoSections.map((section, index) => (
                    <li key={section.id} className="space-y-3 border border-border p-4">
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
                        <Select
                          value={section.kind}
                          onValueChange={(next) => {
                            if (!next) return;
                            set(
                              "infoSections",
                              draft.infoSections.map((item, i) =>
                                i === index ? { ...item, kind: next as InfoSectionKind } : item,
                              ),
                            );
                          }}
                        >
                          <SelectTrigger className="h-10 min-w-32 rounded-full border-transparent bg-muted px-4 shadow-none">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="rounded-none">
                            <SelectItem value="rich_text">Text</SelectItem>
                            <SelectItem value="key_value">Key / value</SelectItem>
                            <SelectItem value="faq">FAQ</SelectItem>
                          </SelectContent>
                        </Select>
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
              </>
            )}
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="pricing" className="border-border">
            <AccordionTrigger className="items-center rounded-none py-4 hover:no-underline">
              <SectionHead
                title="Pricing"
                hint="Base price. SKU rows can override; promotions live in Discounts."
                meta={draft.priceInr ? formatInr(Number(draft.priceInr) || 0) : undefined}
              />
            </AccordionTrigger>
            <AccordionContent className="space-y-4 pb-6">
            <EditorField
              label="Price (INR)"
              hint="Required. Must be greater than 0. Promotions come from the Discounts desk."
              error={errors.priceInr?.message}
            >
              <Input
                type="number"
                min={1}
                step={1}
                value={draft.priceInr}
                aria-invalid={Boolean(errors.priceInr)}
                onChange={(e) => set("priceInr", e.target.value)}
                placeholder="2499"
                className="max-w-48"
              />
            </EditorField>
            <Field
              orientation="horizontal"
              className={cn(
                "items-start border border-border px-4 py-3",
                aiReady.ready && !locked ? "cursor-pointer" : "cursor-not-allowed opacity-60",
              )}
            >
              <Checkbox
                checked={draft.aiRecommend}
                disabled={locked || !aiReady.ready}
                onCheckedChange={(checked) => set("aiRecommend", checked === true)}
                className="mt-0.5"
              />
              <div className="min-w-0 space-y-0.5">
                <FieldLabel className="text-sm font-medium">Recommend by AI</FieldLabel>
                <FieldDescription>
                  {aiReady.ready
                    ? "When this product is live, the stylist can suggest it in shop looks. Embeddings update on save and publish."
                    : `Add ${formatMissingList(aiReady.missing)} so the stylist has enough to embed.`}
                </FieldDescription>
              </div>
            </Field>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="variants" className="border-border">
            <AccordionTrigger className="items-center rounded-none py-4 hover:no-underline">
              <SectionHead
                title="Stock & SKUs"
                hint="Turn on Colour/Size, add SKU rows yourself, or generate all combinations."
                meta={`${draft.variants.length} SKU${draft.variants.length === 1 ? "" : "s"} · ${totalStock} in stock`}
              />
            </AccordionTrigger>
            <AccordionContent className="space-y-4 pb-6">
            <div className="flex flex-wrap justify-end gap-2">
                <Button href={routes.vendorVariants} variant="ghost" size="sm">
                  Manage SKU recipes
                </Button>
                {enabledTypes.length > 0 ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={locked}
                    onClick={fillAllCombinations}
                  >
                    Generate all combinations
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={locked}
                  onClick={addVariantRow}
                >
                  <Plus />
                  Add row
                </Button>
              </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Option dimensions</p>
              <p className="text-xs text-muted-foreground">
                Toggle Colour/Size to choose options per row. Use Generate all combinations only when
                you want every pair at once.
              </p>
              {catalog === undefined || categoryTree === undefined ? (
                <p className="text-sm text-muted-foreground">Loading SKU recipes…</p>
              ) : sortedCatalog.length === 0 ? (
                <Empty className="min-h-0 rounded-none border border-dashed border-border py-8">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Layers />
                    </EmptyMedia>
                    <EmptyTitle>
                      {!productCategoryId ? "Pick a category first" : "No SKU recipes for this category"}
                    </EmptyTitle>
                    <EmptyDescription>
                      {!productCategoryId
                        ? "Choose a category above to see Size, Colour, and other sellable dimensions."
                        : catalog.length === 0
                          ? "Create Size/Colour recipes under Variants, then enable them here."
                          : "No recipes linked to this category or its parents. Link one under Variants."}
                    </EmptyDescription>
                  </EmptyHeader>
                  {productCategoryId ? (
                    <EmptyContent>
                      <Button href={routes.vendorVariants} size="sm">
                        Open Variants
                      </Button>
                    </EmptyContent>
                  ) : null}
                </Empty>
              ) : (
                <ToggleGroup
                  multiple
                  value={draft.variantCategoryIds}
                  onValueChange={(next) => setVariantCategoryIds(next)}
                  disabled={locked}
                  spacing={2}
                  className="flex flex-wrap"
                >
                  {sortedCatalog.map((type) => (
                    <ToggleGroupItem
                      key={type.id}
                      value={type.id}
                      size="sm"
                      className="h-8 rounded-full px-3 aria-pressed:bg-primary aria-pressed:text-primary-foreground"
                    >
                      {type.label}
                      <span className="ml-1.5 opacity-70">{type.options.length}</span>
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              )}
            </div>

            <Separator />

            {enabledTypes.length === 0 ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {!productCategoryId
                    ? "Pick a category, then enable Size/Colour (or other dimensions) to build SKUs. Until then, use the single stock row below."
                    : sortedCatalog.length === 0
                      ? "No SKU recipes for this category yet. Use the default stock row, or create recipes under Variants."
                      : "Enable one or more dimensions above to auto-create SKU rows. Until then, use the single stock row below."}
                </p>
                <div className="overflow-hidden border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="h-9 text-xs text-muted-foreground">SKU</TableHead>
                        <TableHead className="h-9 w-28 text-xs text-muted-foreground">Price</TableHead>
                        <TableHead className="h-9 w-24 text-xs text-muted-foreground">Stock</TableHead>
                        <TableHead className="h-9 w-16 text-center text-xs text-muted-foreground">
                          Active
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {draft.variants.slice(0, 1).map((row, index) => {
                        const rowErrors = errors.variants?.[index];
                        const patch = (changes: Partial<VariantRow>) =>
                          set(
                            "variants",
                            draft.variants.map((item) =>
                              item.key === row.key
                                ? { ...item, ...changes, size: "", colourName: "", colourHex: "", attributeIds: [] }
                                : item,
                            ),
                          );
                        return (
                          <TableRow key={row.key} className="hover:bg-transparent">
                            <TableCell className="py-1.5 text-sm text-muted-foreground">
                              Default
                            </TableCell>
                            <TableCell className="py-1.5">
                              <Input
                                className="h-8 rounded-md px-3 tabular-nums"
                                type="number"
                                min={0}
                                placeholder={draft.priceInr || "—"}
                                value={row.priceInr}
                                aria-invalid={Boolean(rowErrors?.priceInr)}
                                onChange={(e) => patch({ priceInr: e.target.value })}
                              />
                            </TableCell>
                            <TableCell className="py-1.5">
                              <Input
                                className="h-8 rounded-md px-3 tabular-nums"
                                type="number"
                                min={0}
                                value={row.stock}
                                aria-invalid={Boolean(rowErrors?.stock)}
                                onChange={(e) => patch({ stock: e.target.value })}
                              />
                            </TableCell>
                            <TableCell className="py-1.5 text-center">
                              <div className="flex justify-center">
                                <Checkbox
                                  checked={row.active}
                                  onCheckedChange={(checked) =>
                                    patch({ active: checked === true })
                                  }
                                  aria-label="Default SKU active"
                                />
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ) : (
            <div className="overflow-hidden border border-border">
              <Table className="min-w-[40rem]">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    {enabledTypes.map((type) => (
                      <TableHead key={type.id} className="h-9 text-xs text-muted-foreground">
                        {type.label}
                      </TableHead>
                    ))}
                    <TableHead className="h-9 w-28 text-xs text-muted-foreground">Price</TableHead>
                    <TableHead className="h-9 w-24 text-xs text-muted-foreground">Stock</TableHead>
                    <TableHead className="h-9 w-16 text-center text-xs text-muted-foreground">Active</TableHead>
                    <TableHead className="h-9 w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {draft.variants.map((row, index) => {
                    const rowErrors = errors.variants?.[index];
                    const patch = (changes: Partial<VariantRow>) =>
                      set(
                        "variants",
                        draft.variants.map((item) => (item.key === row.key ? { ...item, ...changes } : item)),
                      );
                    return (
                      <TableRow key={row.key} className="hover:bg-transparent">
                        {enabledTypes.map((type) => {
                          const selectedId =
                            row.attributeIds.find(
                              (id) =>
                                optionById(catalog ?? [], id)?.variantCategoryId === type.id,
                            ) ?? "";
                          const selected = selectedId
                            ? type.options.find((option) => option.id === selectedId)
                            : undefined;
                          const swatch =
                            (type.attributeTypeSlug === "colour" ||
                              type.attributeTypeSlug === "color") &&
                            selected
                              ? (selected.hex ?? COLOUR_HEX[selected.value])
                              : undefined;
                          return (
                            <TableCell key={type.id} className="py-1.5">
                              <VariantOptionPicker
                                type={type}
                                value={selected ?? null}
                                disabled={locked}
                                swatch={swatch}
                                ariaLabel={`${type.label} for option ${index + 1}`}
                                onChange={(optionId) => setRowOption(row.key, type, optionId)}
                              />
                            </TableCell>
                          );
                        })}
                        <TableCell className="py-1.5">
                          <Input
                            className="h-8 rounded-md px-3 tabular-nums"
                            type="number"
                            min={0}
                            placeholder={draft.priceInr || "—"}
                            value={row.priceInr}
                            aria-invalid={Boolean(rowErrors?.priceInr)}
                            onChange={(e) => patch({ priceInr: e.target.value })}
                          />
                        </TableCell>
                        <TableCell className="py-1.5">
                          <Input
                            className="h-8 rounded-md px-3 tabular-nums"
                            type="number"
                            min={0}
                            value={row.stock}
                            aria-invalid={Boolean(rowErrors?.stock)}
                            onChange={(e) => patch({ stock: e.target.value })}
                          />
                        </TableCell>
                        <TableCell className="py-1.5 text-center">
                          <div className="flex justify-center">
                            <Checkbox
                              checked={row.active}
                              onCheckedChange={(checked) => patch({ active: checked === true })}
                              aria-label={`Option ${index + 1} active`}
                            />
                          </div>
                        </TableCell>
                        <TableCell className="py-1.5 text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            disabled={draft.variants.length === 1 || locked}
                            onClick={() => set("variants", draft.variants.filter((item) => item.key !== row.key))}
                            aria-label={`Remove option ${index + 1}`}
                          >
                            <X />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            )}

            {errors.variants?.message || errors.variants?.root?.message ? (
              <p className="text-sm text-destructive">
                {errors.variants.message ?? errors.variants.root?.message}
              </p>
            ) : null}
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            </AccordionContent>
          </AccordionItem>
          </Accordion>
        </div>
        </div>
      </div>

      <div className="shrink-0 border-t border-border bg-background px-4 py-3">
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

function formatMissingList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function SectionHead({
  title,
  hint,
  meta,
}: {
  title: string;
  hint?: string;
  meta?: ReactNode;
}) {
  return (
    <div className="min-w-0 flex-1 pr-3 text-left">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-medium tracking-tight">{title}</h3>
        {meta ? (
          <Badge variant="outline" className="font-normal text-muted-foreground">
            {meta}
          </Badge>
        ) : null}
      </div>
      {/* Keep hint short in the trigger so it cannot paint over AccordionContent. */}
      {hint ? (
        <p className="mt-0.5 line-clamp-1 text-xs font-normal text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function EditorField({
  label,
  children,
  hint,
  error,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  error?: string;
}) {
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel>{label}</FieldLabel>
      {children}
      {hint ? <FieldDescription>{hint}</FieldDescription> : null}
      {error ? <FieldError>{error}</FieldError> : null}
    </Field>
  );
}

/** Searchable size/colour picker for a variant row cell. */
function VariantOptionPicker({
  type,
  value,
  disabled,
  swatch,
  ariaLabel,
  onChange,
}: {
  type: CatalogType;
  value: CatalogOption | null;
  disabled?: boolean;
  swatch?: string;
  ariaLabel: string;
  onChange: (optionId: string) => void;
}) {
  return (
    <Combobox
      items={type.options}
      value={value}
      onValueChange={(next) => onChange(next?.id ?? "")}
      itemToStringLabel={(item) => item.label}
      isItemEqualToValue={(a, b) => a.id === b.id}
      disabled={disabled}
      autoHighlight
    >
      <div className="relative flex items-center gap-1.5">
        {swatch ? (
          <span
            aria-hidden
            className="pointer-events-none absolute left-2.5 z-10 size-3.5 rounded-full border border-border"
            style={{ backgroundColor: swatch }}
          />
        ) : null}
        <ComboboxInput
          aria-label={ariaLabel}
          placeholder="Choose…"
          showClear={Boolean(value)}
          className={cn(
            "h-8! w-full min-w-[7rem] rounded-md! border-transparent! bg-muted shadow-none",
            "has-[[data-slot=input-group-control]:focus-visible]:border-foreground",
            "has-[[data-slot=input-group-control]:focus-visible]:bg-background",
            "has-[[data-slot=input-group-control]:focus-visible]:ring-2",
            "has-[[data-slot=input-group-control]:focus-visible]:ring-muted",
            swatch && "[&_[data-slot=input-group-control]]:pl-7",
          )}
        />
      </div>
      <ComboboxContent className="rounded-none">
        <ComboboxEmpty>No matches.</ComboboxEmpty>
        <ComboboxList>
          {(option: CatalogOption) => {
            const hex =
              type.attributeTypeSlug === "colour" || type.attributeTypeSlug === "color"
                ? (option.hex ?? COLOUR_HEX[option.value])
                : undefined;
            return (
              <ComboboxItem key={option.id} value={option}>
                {hex ? (
                  <span
                    aria-hidden
                    className="size-3.5 shrink-0 rounded-full border border-border"
                    style={{ backgroundColor: hex }}
                  />
                ) : null}
                <span className="truncate">{option.label}</span>
              </ComboboxItem>
            );
          }}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
