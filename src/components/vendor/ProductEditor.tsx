"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { ImagePlus, Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import type { FunctionReturnType } from "convex/server";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  AGE_GROUPS,
  AGE_GROUP_LABELS,
  isProductType,
  MAX_PRODUCT_IMAGES,
  OCCASIONS,
  OCCASION_LABELS,
  PRODUCT_CATEGORIES,
  PRODUCT_CATEGORY_LABELS,
  productTypeLabel,
  productTypesFor,
  type AgeGroup,
  type Occasion,
  type ProductCategory,
} from "@convex/shared/products";
import type { Presentation } from "@convex/shared/wardrobe";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useVendor } from "@/components/vendor/VendorDesk";
import { useUpload } from "@/hooks/use-upload";
import { reportError } from "@/lib/client-errors";
import { cn } from "@/lib/cn";
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
  size: string;
  colourName: string;
  colourHex: string;
  priceInr: string;
  stock: string;
  active: boolean;
};

type Draft = {
  name: string;
  brand: string;
  productType: string;
  subcategory: string;
  description: string;
  category: ProductCategory;
  presentation: Presentation;
  colourPrimary: string;
  colourSecondary: string;
  colourHex: string;
  pattern: string;
  material: string;
  size: string;
  ageGroup: AgeGroup | "";
  occasion: Occasion | "";
  priceInr: string;
  compareAtPriceInr: string;
  variants: VariantRow[];
};

function newVariant(): VariantRow {
  return { key: crypto.randomUUID(), size: "", colourName: "", colourHex: "", priceInr: "", stock: "0", active: true };
}

const EMPTY: Draft = {
  name: "",
  brand: "",
  productType: "",
  subcategory: "",
  description: "",
  category: "clothes",
  presentation: "neutral",
  colourPrimary: "",
  colourSecondary: "",
  colourHex: "",
  pattern: "",
  material: "",
  size: "",
  ageGroup: "",
  occasion: "",
  priceInr: "",
  compareAtPriceInr: "",
  variants: [newVariant()],
};

type ProductView = NonNullable<FunctionReturnType<typeof api.vendorProducts.get>>;

function draftFrom(product: ProductView): Draft {
  return {
    name: product.name,
    brand: product.brand ?? "",
    productType: product.productType ?? "",
    subcategory: product.subcategory,
    description: product.description,
    category: product.category,
    presentation: product.presentation,
    colourPrimary: product.colours.primary,
    colourSecondary: product.colours.secondary.join(", "),
    colourHex: product.colours.hex[0] ?? "",
    pattern: product.pattern ?? "",
    material: product.material ?? "",
    size: product.size ?? "",
    ageGroup: product.ageGroup ?? "",
    occasion: product.occasion ?? "",
    priceInr: String(product.priceInr),
    compareAtPriceInr: product.compareAtPriceInr ? String(product.compareAtPriceInr) : "",
    variants: product.variants.length
      ? product.variants.map((variant) => ({
          key: variant.id,
          id: variant.id,
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
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const locked = me.vendor.status === "suspended" || me.vendor.status === "closed";

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

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
    return {
      category: draft.category,
      presentation: draft.presentation,
      name: draft.name.trim(),
      brand: draft.brand.trim() || undefined,
      subcategory: subcategory || draft.category,
      productType: draft.productType || undefined,
      description: draft.description.trim(),
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
      imageIds: slots.flatMap((slot) => (slot.storageId ? [slot.storageId] : [])),
      variants: draft.variants.map((row) => ({
        id: row.id,
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium tracking-tight">{product ? product.name || "Edit product" : "New product"}</h2>
          <p className="text-sm text-mute">
            {product?.sku ? `SKU ${product.sku}` : "A SKU is assigned when you save."}
            {product ? ` · ${product.status === "active" ? "Live" : product.status === "draft" ? "Draft" : "Archived"}` : ""}
          </p>
        </div>
        {product ? (
          <div className="flex flex-wrap gap-2">
            {product.status === "active" ? (
              <Button variant="secondary" size="sm" disabled={locked} onClick={() => void unpublish({ productId: product.id }).then(() => toast.success("Hidden from the shop.")).catch((e) => toast.error(reportError(e).message))}>
                Unpublish
              </Button>
            ) : null}
            {product.status !== "archived" ? (
              <ConfirmDialog
                trigger={
                  <Button variant="destructive" size="sm" disabled={locked}>
                    <Trash2 />
                    Archive
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
          </div>
        ) : null}
      </div>

      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <section className="space-y-4 lg:sticky lg:top-20">
          <div className="relative aspect-square bg-soft-cloud">
            {chosen?.previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={chosen.previewUrl} alt="" className={cn("h-full w-full object-cover", chosen.uploading && "opacity-50")} />
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center"
              >
                <ImagePlus className="size-6" aria-hidden />
                <p className="text-sm font-medium">Add a product photo</p>
                <p className="text-sm text-mute">JPEG, PNG, or WebP. Up to {MAX_PRODUCT_IMAGES} photos, 5 MB each.</p>
              </button>
            )}
            {chosen?.uploading ? (
              <p className="absolute inset-x-0 bottom-0 bg-ink/80 px-4 py-3 text-sm font-medium text-canvas">Uploading…</p>
            ) : filling ? (
              <p className="absolute inset-x-0 bottom-0 bg-ink/80 px-4 py-3 text-sm font-medium text-canvas">Reading this photo…</p>
            ) : null}
            {chosen && chosen.key === coverKey ? (
              <span className="absolute top-3 left-3 rounded-full bg-canvas px-3 py-1 text-xs font-medium">Cover</span>
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
                  className={cn("block aspect-square w-full bg-soft-cloud", slot.key === chosen?.key && "ring-2 ring-ink ring-offset-2")}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={slot.previewUrl} alt="" className="h-full w-full object-cover" />
                </button>
                <button
                  type="button"
                  onClick={() => void removeSlot(slot)}
                  aria-label={`Remove photo ${index + 1}`}
                  className="absolute top-1 right-1 flex size-8 items-center justify-center rounded-full bg-canvas text-ink"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </li>
            ))}
            {slots.length < MAX_PRODUCT_IMAGES ? (
              <li>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex aspect-square w-full flex-col items-center justify-center gap-1 bg-soft-cloud text-sm font-medium"
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
            <Button type="button" variant="secondary" size="sm" disabled={!chosen?.storageId || filling || saving} onClick={() => void fillFromPhoto()}>
              {filling ? "Reading…" : "Fill from photo"}
            </Button>
            {chosen && chosen.key !== coverKey ? (
              <Button type="button" variant="secondary" size="sm" onClick={() => makeCover(chosen.key)}>
                Make cover
              </Button>
            ) : null}
          </div>
          <p className="text-sm text-mute">The first photo is the shop cover. Select a photo and fill the listing from it, then adjust anything.</p>
        </section>

        <section className="space-y-8">
          <div className="space-y-4">
            <h3 className="text-sm font-medium">Listing</h3>
            <Field label="Name">
              <Input required maxLength={80} value={draft.name} onChange={(e) => set("name", e.target.value)} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Brand">
                <Input maxLength={80} value={draft.brand} onChange={(e) => set("brand", e.target.value)} />
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
            <Field label="Description">
              <Textarea rows={4} maxLength={400} value={draft.description} onChange={(e) => set("description", e.target.value)} />
            </Field>
          </div>

          <ChoiceGroup
            legend="Category"
            value={draft.category}
            onChange={(next) => {
              set("category", next as ProductCategory);
              if (!isProductType(next as ProductCategory, draft.productType)) set("productType", "");
            }}
            options={PRODUCT_CATEGORIES.map((item) => ({ value: item, label: PRODUCT_CATEGORY_LABELS[item] }))}
          />
          <ChoiceGroup legend="Who it is for" value={draft.presentation} onChange={(next) => set("presentation", next as Presentation)} options={AUDIENCE} />
          <ChoiceGroup legend="Age" value={draft.ageGroup} onChange={(next) => set("ageGroup", next as AgeGroup | "")} options={AGE_GROUPS.map((item) => ({ value: item, label: AGE_GROUP_LABELS[item] }))} clearable />
          <ChoiceGroup legend="Occasion" value={draft.occasion} onChange={(next) => set("occasion", next as Occasion | "")} options={OCCASIONS.map((item) => ({ value: item, label: OCCASION_LABELS[item] }))} clearable />

          <div className="grid gap-4 border-t border-hairline pt-8 sm:grid-cols-2">
            <Field label="Colour">
              <Input maxLength={40} value={draft.colourPrimary} onChange={(e) => set("colourPrimary", e.target.value)} />
            </Field>
            <Field label="Colour value">
              <span className="flex gap-2">
                <input
                  type="color"
                  aria-label="Pick a colour"
                  value={/^#[0-9a-fA-F]{6}$/.test(draft.colourHex) ? draft.colourHex : "#111111"}
                  onChange={(e) => set("colourHex", e.target.value)}
                  className="h-12 w-14 shrink-0 rounded-full bg-soft-cloud"
                />
                <Input value={draft.colourHex} onChange={(e) => set("colourHex", e.target.value)} placeholder="#1b2a4a" maxLength={7} />
              </span>
            </Field>
            <Field label="Other colours">
              <Input value={draft.colourSecondary} onChange={(e) => set("colourSecondary", e.target.value)} placeholder="navy, white" />
            </Field>
            <Field label="Pattern">
              <Input maxLength={40} value={draft.pattern} onChange={(e) => set("pattern", e.target.value)} placeholder="solid, stripe, check" />
            </Field>
            <Field label="Material">
              <Input maxLength={60} value={draft.material} onChange={(e) => set("material", e.target.value)} placeholder="100% linen" />
            </Field>
            <Field label="One size / fit note">
              <Input maxLength={24} value={draft.size} onChange={(e) => set("size", e.target.value)} placeholder="Only for one-size pieces" />
            </Field>
          </div>

          <div className="grid gap-4 border-t border-hairline pt-8 sm:grid-cols-2">
            <Field label="Price (INR)">
              <Input type="number" required min={0} step={1} value={draft.priceInr} onChange={(e) => set("priceInr", e.target.value)} />
            </Field>
            <Field label="Compare-at price (INR)" hint="Shown struck through when higher than the price.">
              <Input type="number" min={0} step={1} value={draft.compareAtPriceInr} onChange={(e) => set("compareAtPriceInr", e.target.value)} />
            </Field>
          </div>

          <div className="space-y-3 border-t border-hairline pt-8">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium">Sizes, colours and stock</h3>
                <p className="text-sm text-mute">One row per sellable option. Leave price blank to use the product price.</p>
              </div>
              <Button type="button" variant="secondary" size="sm" onClick={() => set("variants", [...draft.variants, newVariant()])}>
                <Plus />
                Add option
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-sm">
                <thead>
                  <tr className="text-left text-xs text-mute">
                    <th className="py-2 pr-2 font-medium">Size</th>
                    <th className="py-2 pr-2 font-medium">Colour</th>
                    <th className="py-2 pr-2 font-medium">Hex</th>
                    <th className="py-2 pr-2 font-medium">Price</th>
                    <th className="py-2 pr-2 font-medium">Stock</th>
                    <th className="py-2 pr-2 font-medium">On sale</th>
                    <th className="py-2 font-medium" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {draft.variants.map((row, index) => {
                    const patch = (changes: Partial<VariantRow>) =>
                      set("variants", draft.variants.map((item) => (item.key === row.key ? { ...item, ...changes } : item)));
                    return (
                      <tr key={row.key}>
                        <td className="py-2 pr-2"><Input className="h-10" placeholder="M" value={row.size} onChange={(e) => patch({ size: e.target.value })} /></td>
                        <td className="py-2 pr-2"><Input className="h-10" placeholder="Oat" value={row.colourName} onChange={(e) => patch({ colourName: e.target.value })} /></td>
                        <td className="py-2 pr-2"><Input className="h-10" placeholder="#d8cbb4" maxLength={7} value={row.colourHex} onChange={(e) => patch({ colourHex: e.target.value })} /></td>
                        <td className="py-2 pr-2"><Input className="h-10" type="number" min={0} placeholder={draft.priceInr || "—"} value={row.priceInr} onChange={(e) => patch({ priceInr: e.target.value })} /></td>
                        <td className="py-2 pr-2"><Input className="h-10" type="number" min={0} value={row.stock} onChange={(e) => patch({ stock: e.target.value })} /></td>
                        <td className="py-2 pr-2">
                          <input type="checkbox" checked={row.active} onChange={(e) => patch({ active: e.target.checked })} className="size-5 accent-ink" aria-label={`Option ${index + 1} on sale`} />
                        </td>
                        <td className="py-2 text-right">
                          <button
                            type="button"
                            disabled={draft.variants.length === 1}
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
          </div>

          {error ? <p className="text-sm text-sale">{error}</p> : null}
          <div className="flex flex-wrap items-center gap-3 border-t border-hairline pt-8">
            <Button type="button" disabled={saving || uploading || locked} onClick={() => void save()}>
              {saving ? "Saving…" : product ? "Save changes" : "Save draft"}
            </Button>
            {product?.status !== "active" ? (
              <Button type="button" variant="secondary" disabled={saving || uploading || locked || me.vendor.status !== "active"} onClick={() => void saveAndPublish()}>
                Save and publish
              </Button>
            ) : null}
            <Button href={routes.vendorProducts} variant="ghost">
              Back to products
            </Button>
            {me.vendor.status !== "active" ? (
              <p className="basis-full text-xs text-mute">Publishing unlocks once the store is approved.</p>
            ) : null}
          </div>
        </section>
      </div>
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
