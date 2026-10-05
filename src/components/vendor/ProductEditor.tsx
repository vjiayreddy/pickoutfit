"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { ArrowLeft, ImagePlus, Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useForm, useFormState, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
  MAX_INFO_SECTIONS,
  MAX_PRODUCT_IMAGES,
  OCCASIONS,
  OCCASION_LABELS,
  productTypeLabel,
  type AgeGroup,
  type InfoSectionKind,
  type Occasion,
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
import { routes } from "@/lib/routes";

const AUDIENCE: { value: Presentation; label: string }[] = [
  { value: "masculine", label: "Men" },
  { value: "feminine", label: "Women" },
  { value: "neutral", label: "Everyone" },
];
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

type Slot = { key: string; storageId?: Id<"_storage">; previewUrl: string; uploading: boolean };

type VariantRow = ProductFormValues["variants"][number];
type InfoRow = ProductFormValues["infoSections"][number];
type Draft = ProductFormValues;

const KNOWN_ATTR_KEYS = new Set<string>(Object.values(ATTR));

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
  brandId: null,
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

function optionById(catalog: VariantCatalog, optionId: string): CatalogOption | undefined {
  for (const type of catalog) {
    const match = type.options.find((option) => option.id === optionId);
    if (match) return match;
  }
  return undefined;
}

/** Keep free-text size/colour in sync with selected catalog options. */
function labelsFromOptions(
  catalog: VariantCatalog,
  optionIds: string[],
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
    brandId: product.brandId,
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

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: product ? draftFrom(product) : EMPTY,
    mode: "onSubmit",
    reValidateMode: "onChange",
  });
  const draft = (useWatch({ control: form.control }) ?? form.getValues()) as ProductFormValues;
  const { errors, isSubmitted } = useFormState({ control: form.control });

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

  // Drop stale/orphan type + option ids that are not in this store's catalog.
  useEffect(() => {
    if (!catalog?.length) return;
    const allowedTypes = new Set(catalog.map((type) => type.id as string));
    const allowedOptions = new Set(
      catalog.flatMap((type) => type.options.map((option) => option.id as string)),
    );
    setDraft((current) => {
      const variantTypeIds = current.variantTypeIds.filter((id) => allowedTypes.has(id));
      let variantsChanged = false;
      const variants = current.variants.map((row) => {
        const optionIds = row.optionIds.filter((id) => allowedOptions.has(id));
        if (optionIds.length === row.optionIds.length) return row;
        variantsChanged = true;
        return {
          ...row,
          optionIds,
          ...labelsFromOptions(catalog, optionIds),
        };
      });
      if (variantTypeIds.length === current.variantTypeIds.length && !variantsChanged) {
        return current;
      }
      return { ...current, variantTypeIds, variants };
    });
  }, [catalog]);

  // New products default to Size + Colour once the catalog loads.
  useEffect(() => {
    if (product || !catalog?.length || defaultedTypes.current) return;
    defaultedTypes.current = true;
    const defaults = catalog
      .filter((type) => type.slug === "size" || type.slug === "colour")
      .map((type) => type.id as string);
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

  function setVariantTypeIds(nextIds: string[]) {
    const removed = draft.variantTypeIds.filter((id) => !nextIds.includes(id));
    const removedOptionIds = new Set<string>();
    if (removed.length > 0 && catalog) {
      for (const typeId of removed) {
        const type = catalog.find((row) => row.id === typeId);
        for (const option of type?.options ?? []) removedOptionIds.add(option.id);
      }
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
        // Keep only options that still exist in the live catalog (drop legacy orphans).
        const known = row.optionIds.filter((id) => Boolean(optionById(catalog, id)));
        const withoutType = known.filter((id) => {
          const option = optionById(catalog, id);
          return option?.variantTypeId !== type.id;
        });
        const optionIds = optionId ? [...withoutType, optionId] : withoutType;
        return {
          ...row,
          optionIds,
          ...labelsFromOptions(catalog, optionIds),
        };
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
  const hasEmbedImage = slots.some((slot) => Boolean(slot.storageId) && !slot.uploading);
  const aiReady = useMemo(
    () =>
      aiRecommendReadiness({
        name: draft.name,
        description: draft.description,
        colourPrimary: draft.colourPrimary,
        material: draft.material,
        pattern: draft.pattern,
        priceInr: draft.priceInr,
        hasImage: hasEmbedImage,
      }),
    [
      draft.name,
      draft.description,
      draft.colourPrimary,
      draft.material,
      draft.pattern,
      draft.priceInr,
      hasEmbedImage,
    ],
  );

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
      setDraft((current) => ({
        ...current,
        name: result.name,
        brandId: null,
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

  function buildArgs(values: ProductFormValues) {
    const price = Number(values.priceInr);
    const compareAt = values.compareAtPriceInr ? Number(values.compareAtPriceInr) : undefined;
    const hex = values.colourHex.trim();
    const subcategory = values.productType
      ? productTypeLabel(values.productType)
      : values.subcategory.trim();
    const customAttributes = values.customAttributes
      .map((row) => {
        const key = row.keyInput.trim().toLowerCase().replace(/\s+/g, "_");
        const value = row.value.trim();
        if (!key || !value || KNOWN_ATTR_KEYS.has(key)) return null;
        return { key, label: row.label.trim() || attrLabel(key), value };
      })
      .filter((row): row is { key: string; label: string; value: string } => row !== null);
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
      attributes: customAttributes,
      infoSections: infoSections.length > 0 ? infoSections : undefined,
      subcategory: subcategory || values.category,
      productType: values.productType || undefined,
      colours: {
        primary: values.colourPrimary.trim(),
        secondary: values.colourSecondary
          .split(",")
          .map((part) => part.trim())
          .filter(Boolean),
        hex: /^#[0-9a-fA-F]{6}$/.test(hex) ? [hex.toLowerCase()] : [],
      },
      pattern: values.pattern.trim() || undefined,
      material: values.material.trim() || undefined,
      size: values.size.trim() || undefined,
      ageGroup: values.ageGroup || undefined,
      occasion: values.occasion || undefined,
      priceInr: Math.round(price),
      compareAtPriceInr: compareAt && compareAt > 0 ? Math.round(compareAt) : undefined,
      variantTypeIds:
        values.variantTypeIds.length > 0
          ? (values.variantTypeIds as Id<"variantTypes">[])
          : undefined,
      aiRecommend: values.aiRecommend,
      imageIds: slots.flatMap((slot) => (slot.storageId ? [slot.storageId] : [])),
      variants: values.variants.map((row) => ({
        id: row.id as Id<"productVariants"> | undefined,
        optionIds:
          row.optionIds.length > 0 ? (row.optionIds as Id<"variantOptions">[]) : undefined,
        size: row.size.trim() || undefined,
        colour:
          row.colourName.trim() || /^#[0-9a-fA-F]{6}$/.test(row.colourHex)
            ? {
                name: row.colourName.trim() || values.colourPrimary.trim(),
                hex: /^#[0-9a-fA-F]{6}$/.test(row.colourHex)
                  ? row.colourHex.toLowerCase()
                  : hex || "#111111",
              }
            : undefined,
        priceInr: row.priceInr ? Math.round(Number(row.priceInr)) : undefined,
        stock: Math.max(0, Math.round(Number(row.stock) || 0)),
        active: row.active,
      })),
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
              {draft.variants.length} variant{draft.variants.length === 1 ? "" : "s"}
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

        <div className="min-w-0">
          <Accordion
            multiple
            defaultValue={["basics", "classification", "attributes", "info", "pricing", "variants"]}
            className="w-full"
          >
          <AccordionItem value="basics" className="border-border">
            <AccordionTrigger className="rounded-none py-4 hover:no-underline">
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
            <AccordionTrigger className="rounded-none py-4 hover:no-underline">
              <SectionHead title="Classification" hint="Category tree and who this piece is for." />
            </AccordionTrigger>
            <AccordionContent className="space-y-4 pb-6">
            <CategoryTreePicker
              value={draft.categoryId as Id<"categories"> | null}
              onChange={(pick) => {
                if (!pick) {
                  setDraft((prev) => ({ ...prev, categoryId: null, productType: "" }));
                  return;
                }
                setDraft((prev) => ({
                  ...prev,
                  categoryId: pick.categoryId,
                  category: pick.legacyCategory,
                  productType: pick.productTypeHint ?? "",
                  subcategory: pick.name,
                }));
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
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="attributes" className="border-border">
            <AccordionTrigger className="rounded-none py-4 hover:no-underline">
              <SectionHead title="Attributes" hint="Helps search and outfit matching." />
            </AccordionTrigger>
            <AccordionContent className="space-y-4 pb-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <EditorField label="Primary colour" error={errors.colourPrimary?.message}>
                <Input
                  maxLength={40}
                  value={draft.colourPrimary}
                  aria-invalid={Boolean(errors.colourPrimary)}
                  onChange={(e) => set("colourPrimary", e.target.value)}
                  placeholder="Khaki"
                />
              </EditorField>
              <EditorField label="Colour hex" error={errors.colourHex?.message}>
                <span className="flex gap-2">
                  <input
                    type="color"
                    aria-label="Pick a colour"
                    value={/^#[0-9a-fA-F]{6}$/.test(draft.colourHex) ? draft.colourHex : "#111111"}
                    onChange={(e) => set("colourHex", e.target.value)}
                    className="h-10 w-10 shrink-0 rounded-full border border-transparent bg-muted"
                  />
                  <Input
                    value={draft.colourHex}
                    aria-invalid={Boolean(errors.colourHex)}
                    onChange={(e) => set("colourHex", e.target.value)}
                    placeholder="#c4a574"
                    maxLength={7}
                  />
                </span>
              </EditorField>
              <EditorField label="Other colours" error={errors.colourSecondary?.message}>
                <Input
                  value={draft.colourSecondary}
                  aria-invalid={Boolean(errors.colourSecondary)}
                  onChange={(e) => set("colourSecondary", e.target.value)}
                  placeholder="navy, white"
                />
              </EditorField>
              <EditorField label="Pattern" error={errors.pattern?.message}>
                <Input
                  maxLength={40}
                  value={draft.pattern}
                  aria-invalid={Boolean(errors.pattern)}
                  onChange={(e) => set("pattern", e.target.value)}
                  placeholder="solid, stripe, check"
                />
              </EditorField>
              <EditorField label="Material" error={errors.material?.message}>
                <Input
                  maxLength={60}
                  value={draft.material}
                  aria-invalid={Boolean(errors.material)}
                  onChange={(e) => set("material", e.target.value)}
                  placeholder="Cotton twill"
                />
              </EditorField>
              <EditorField
                label="One-size note"
                hint="Only if this piece has no size variants."
                error={errors.size?.message}
              >
                <Input
                  maxLength={24}
                  value={draft.size}
                  aria-invalid={Boolean(errors.size)}
                  onChange={(e) => set("size", e.target.value)}
                  placeholder="One size"
                />
              </EditorField>
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
                <p className="text-xs text-muted-foreground">Optional. Add neckline, SPF, frame shape, or any trait.</p>
              ) : (
                <ul className="space-y-3">
                  {draft.customAttributes.map((row, index) => (
                    <li key={`attr-${index}`} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                      <div className="space-y-1">
                        <Input
                          value={row.keyInput}
                          aria-invalid={Boolean(errors.customAttributes?.[index]?.keyInput)}
                          onChange={(e) => {
                            const keyInput = e.target.value;
                            set(
                              "customAttributes",
                              draft.customAttributes.map((item, i) =>
                                i === index
                                  ? {
                                      ...item,
                                      keyInput,
                                      label:
                                        item.label ||
                                        attrLabel(keyInput.trim().toLowerCase().replace(/\s+/g, "_")),
                                    }
                                  : item,
                              ),
                            );
                          }}
                          placeholder="Key (e.g. neckline)"
                          maxLength={40}
                        />
                        {errors.customAttributes?.[index]?.keyInput?.message ? (
                          <FieldError>{errors.customAttributes[index].keyInput.message}</FieldError>
                        ) : null}
                      </div>
                      <div className="space-y-1">
                        <Input
                          value={row.value}
                          aria-invalid={Boolean(errors.customAttributes?.[index]?.value)}
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
                        {errors.customAttributes?.[index]?.value?.message ? (
                          <FieldError>{errors.customAttributes[index].value.message}</FieldError>
                        ) : null}
                      </div>
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
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="info" className="border-border">
            <AccordionTrigger className="rounded-none py-4 hover:no-underline">
              <SectionHead
                title="Product information"
                hint="Accordion sections on the product page. Add, rename, or remove freely."
              />
            </AccordionTrigger>
            <AccordionContent className="space-y-4 pb-6">
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
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="pricing" className="border-border">
            <AccordionTrigger className="rounded-none py-4 hover:no-underline">
              <SectionHead title="Pricing" hint="Base price for the product. Variants can override." />
            </AccordionTrigger>
            <AccordionContent className="space-y-4 pb-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <EditorField label="Price (INR)" error={errors.priceInr?.message}>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={draft.priceInr}
                  aria-invalid={Boolean(errors.priceInr)}
                  onChange={(e) => set("priceInr", e.target.value)}
                  placeholder="2499"
                />
              </EditorField>
              <EditorField
                label="Compare-at (INR)"
                hint="Shown struck through when higher than price."
                error={errors.compareAtPriceInr?.message}
              >
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={draft.compareAtPriceInr}
                  aria-invalid={Boolean(errors.compareAtPriceInr)}
                  onChange={(e) => set("compareAtPriceInr", e.target.value)}
                />
              </EditorField>
            </div>
            <label
              className={cn(
                "flex items-start gap-3 border border-border px-4 py-3",
                aiReady.ready && !locked ? "cursor-pointer" : "cursor-not-allowed opacity-60",
              )}
            >
              <Checkbox
                checked={draft.aiRecommend}
                disabled={locked || !aiReady.ready}
                onCheckedChange={(checked) => set("aiRecommend", checked === true)}
                className="mt-1"
              />
              <span className="min-w-0 space-y-0.5">
                <span className="block text-sm font-medium">Recommend by AI</span>
                <span className="block text-xs text-muted-foreground">
                  {aiReady.ready
                    ? "When this product is live, the stylist can suggest it in shop looks. Embeddings update on save and publish."
                    : `Add ${formatMissingList(aiReady.missing)} so the stylist has enough to embed.`}
                </span>
              </span>
            </label>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="variants" className="border-border">
            <AccordionTrigger className="rounded-none py-4 hover:no-underline">
              <SectionHead
                title="Variants & stock"
                hint="Enable Size / Colour, then set stock per SKU. Manage the option lists in Variants."
              />
            </AccordionTrigger>
            <AccordionContent className="space-y-4 pb-6">
            <div className="flex flex-wrap justify-end gap-2">
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

            <div className="space-y-2">
              <p className="text-sm font-medium">Option dimensions</p>
              {catalog === undefined || seedingCatalog ? (
                <p className="text-sm text-muted-foreground">Loading size and colour options…</p>
              ) : catalog.length === 0 ? (
                <p className="text-sm text-muted-foreground">No variant catalog yet. Refresh after seeding completes.</p>
              ) : (
                <ToggleGroup
                  multiple
                  value={draft.variantTypeIds}
                  onValueChange={(next) => setVariantTypeIds(next)}
                  disabled={locked}
                  spacing={2}
                  className="flex flex-wrap"
                >
                  {catalog.map((type) => (
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

            <div className="overflow-hidden border border-border">
              <Table className="min-w-[40rem]">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    {enabledTypes.length > 0 ? (
                      enabledTypes.map((type) => (
                        <TableHead key={type.id} className="h-9 text-xs text-muted-foreground">
                          {type.label}
                        </TableHead>
                      ))
                    ) : (
                      <>
                        <TableHead className="h-9 text-xs text-muted-foreground">Size</TableHead>
                        <TableHead className="h-9 text-xs text-muted-foreground">Colour</TableHead>
                        <TableHead className="h-9 w-28 text-xs text-muted-foreground">Hex</TableHead>
                      </>
                    )}
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
                        {enabledTypes.length > 0 ? (
                          enabledTypes.map((type) => {
                            const selectedId =
                              row.optionIds.find(
                                (id) => optionById(catalog ?? [], id)?.variantTypeId === type.id,
                              ) ?? "";
                            const selected = selectedId
                              ? type.options.find((option) => option.id === selectedId)
                              : undefined;
                            const swatch =
                              type.slug === "colour" && selected
                                ? COLOUR_HEX[selected.value]
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
                          })
                        ) : (
                          <>
                            <TableCell className="py-1.5">
                              <Input
                                className="h-8 rounded-md px-3"
                                placeholder="M"
                                value={row.size}
                                aria-invalid={Boolean(rowErrors?.size)}
                                onChange={(e) => patch({ size: e.target.value })}
                              />
                            </TableCell>
                            <TableCell className="py-1.5">
                              <Input
                                className="h-8 rounded-md px-3"
                                placeholder="Oat"
                                value={row.colourName}
                                aria-invalid={Boolean(rowErrors?.colourName)}
                                onChange={(e) => patch({ colourName: e.target.value })}
                              />
                            </TableCell>
                            <TableCell className="py-1.5">
                              <div className="flex items-center gap-2">
                                <span
                                  aria-hidden
                                  className="size-5 shrink-0 rounded-full border border-border"
                                  style={{
                                    backgroundColor: /^#[0-9a-fA-F]{6}$/.test(row.colourHex)
                                      ? row.colourHex
                                      : "transparent",
                                  }}
                                />
                                <Input
                                  className="h-8 rounded-md px-3 font-mono text-xs"
                                  placeholder="#d8cbb4"
                                  maxLength={7}
                                  value={row.colourHex}
                                  aria-invalid={Boolean(rowErrors?.colourHex)}
                                  onChange={(e) => patch({ colourHex: e.target.value })}
                                />
                              </div>
                            </TableCell>
                          </>
                        )}
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

function SectionHead({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="space-y-0.5 text-left">
      <h3 className="text-sm font-medium tracking-tight">{title}</h3>
      {hint ? <p className="text-xs font-normal text-muted-foreground">{hint}</p> : null}
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

function ChoiceGroup({
  legend,
  value,
  onChange,
  options,
}: {
  legend: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
  clearable?: boolean;
}) {
  return (
    <Field>
      <FieldLabel>{legend}</FieldLabel>
      <ToggleGroup
        value={value ? [value] : []}
        onValueChange={(next) => onChange(next[0] ?? "")}
        spacing={2}
        className="flex flex-wrap"
      >
        {options.map((option) => (
          <ToggleGroupItem
            key={option.value}
            value={option.value}
            size="sm"
            className="h-8 rounded-full px-3 aria-pressed:bg-primary aria-pressed:text-primary-foreground"
          >
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
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
            const hex = type.slug === "colour" ? COLOUR_HEX[option.value] : undefined;
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
