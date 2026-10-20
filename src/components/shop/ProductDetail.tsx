"use client";

import { useMutation, useQuery } from "convex/react";
import { Package, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { ATTR, PRODUCT_CATEGORY_LABELS } from "@convex/shared/products";
import type { Slot } from "@convex/shared/wardrobe";
import { EmptyState } from "@/components/common/EmptyState";
import { AppHeaderTitle } from "@/components/layout/app-header";
import { AddToTrialRoomSheet } from "@/components/shop/AddToTrialRoomSheet";
import { Button } from "@/components/ui/button";
import { reportError } from "@/lib/client-errors";
import { cn } from "@/lib/cn";
import { formatInr } from "@/lib/format";
import { routes } from "@/lib/routes";

const HIDDEN_ATTR_KEYS = new Set<string>([
  ATTR.colorHex,
  ATTR.colorSecondary,
  ATTR.productType,
  ATTR.subcategory,
]);

function variantLabel(variant: {
  size: string | null;
  colour: { name: string } | null;
}): string {
  const parts = [variant.size, variant.colour?.name].filter(Boolean);
  return parts.length > 0 ? parts.join(" / ") : "Option";
}

export function ProductDetail({
  vendorSlug,
  productSlug,
}: {
  vendorSlug: string;
  productSlug: string;
}) {
  const router = useRouter();
  const data = useQuery(api.products.bySlug, { vendorSlug, productSlug });
  const add = useMutation(api.cart.add);
  const addManyToTrial = useMutation(api.trialRoom.addMany);
  const [variantId, setVariantId] = useState<Id<"productVariants"> | null>(null);
  const [pending, setPending] = useState(false);
  const [pendingLook, setPendingLook] = useState(false);
  const [imageIndex, setImageIndex] = useState(0);
  const [trialOpen, setTrialOpen] = useState(false);

  useEffect(() => {
    setImageIndex(0);
    setVariantId(null);
  }, [vendorSlug, productSlug]);

  useEffect(() => {
    setImageIndex(0);
  }, [variantId]);

  if (data === undefined) {
    return <div className="h-64 animate-pulse bg-soft-cloud" />;
  }
  if (data === null) {
    return (
      <EmptyState
        icon={Package}
        title="Product unavailable"
        description="It may be sold out, unpublished, or the link is wrong."
        action={<Button href={routes.shop}>Back to shop</Button>}
      />
    );
  }

  const { product, look } = data;
  const variants = product.variants;
  const selectableVariants = variants.filter((variant) => variant.active);
  const multiVariant = variants.length > 1;
  const selectedVariant =
    selectableVariants.find((variant) => variant.id === variantId) ??
    (multiVariant ? null : (selectableVariants[0] ?? null));
  const variantImages = selectedVariant
    ? product.images.filter((image) => image.variantId === selectedVariant.id)
    : [];
  const galleryImages = variantImages.length > 0 ? variantImages : product.images.filter((image) => !image.variantId);
  const imageUrls = [
    ...(galleryImages.length > 0 ? galleryImages : product.images)
      .map((image) => image.url)
      .filter((url): url is string => Boolean(url)),
  ];
  if (imageUrls.length === 0 && product.imageUrl) imageUrls.push(product.imageUrl);
  const activeImageUrl = imageUrls[imageIndex] ?? imageUrls[0] ?? null;
  const priceInr = selectedVariant?.priceInr ?? product.priceInr;
  const soldOut =
    selectableVariants.length === 0 ||
    product.totalStock === 0 ||
    (selectedVariant !== null && selectedVariant.stock === 0);
  const displayAttributes = product.attributes.filter(
    (row) => row.value && !HIDDEN_ATTR_KEYS.has(row.key),
  );
  const infoSections = [...product.infoSections].sort((a, b) => a.position - b.position);
  const canTryOnSingle = product.canTryOn && Boolean(product.tryOnSlot);
  const lookTryOnItems = [product, ...look].filter(
    (row): row is typeof product & { tryOnSlot: Slot } =>
      Boolean(row.canTryOn && row.tryOnSlot),
  );
  const canTryOnLook = lookTryOnItems.length > 1;

  async function addLookToTrialRoom() {
    if (pendingLook || !canTryOnLook) return;
    setPendingLook(true);
    try {
      const result = await addManyToTrial({
        items: lookTryOnItems.map((row) => ({
          productId: row.id,
          slot: row.tryOnSlot as Slot,
        })),
      });
      toast.success(
        result.added === 1
          ? "Added to trial room"
          : `Added ${result.added} pieces to trial room`,
      );
      router.push(routes.trialRoom);
    } catch (error) {
      toast.error(reportError(error).message);
    } finally {
      setPendingLook(false);
    }
  }

  async function addToBag() {
    if (pending || soldOut) return;
    if (multiVariant && !selectedVariant) {
      toast.error("Choose a size first.");
      return;
    }
    setPending(true);
    try {
      await add({
        productId: product.id,
        addedFrom: "store",
        ...(selectedVariant ? { variantId: selectedVariant.id } : {}),
      });
      toast.success("Added to bag");
    } catch (error) {
      toast.error(reportError(error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-10">
      <AppHeaderTitle title={product.name} />

      <div className="grid gap-8 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="aspect-square bg-soft-cloud">
            {activeImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={activeImageUrl} alt="" className="h-full w-full object-cover" />
            ) : null}
          </div>
          {imageUrls.length > 1 ? (
            <ul className="flex flex-wrap gap-2">
              {imageUrls.map((url, index) => (
                <li key={`${url}-${index}`}>
                  <button
                    type="button"
                    onClick={() => setImageIndex(index)}
                    className={cn(
                      "size-16 overflow-hidden bg-soft-cloud",
                      index === imageIndex && "ring-2 ring-ink ring-offset-2",
                    )}
                    aria-label={`View image ${index + 1}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" className="h-full w-full object-cover" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="space-y-6">
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-mute">
              {PRODUCT_CATEGORY_LABELS[product.category]}
            </p>
            <h1 className="text-2xl font-medium tracking-tight sm:text-3xl">{product.name}</h1>
            <Link
              href={routes.store(product.vendorSlug)}
              className="inline-block text-sm font-medium text-ink underline decoration-hairline underline-offset-2"
            >
              {product.vendorName}
            </Link>
            <p className="text-lg font-medium">
              <span className={product.offer ? "text-sale" : undefined}>{formatInr(priceInr)}</span>
              {product.compareAtPriceInr && product.compareAtPriceInr > priceInr ? (
                <span className="ml-2 text-base font-normal text-mute line-through">
                  {formatInr(product.compareAtPriceInr)}
                </span>
              ) : null}
            </p>
            {product.offer ? (
              <p className="text-sm font-medium text-sale">
                {product.offer.badge?.trim() ||
                  (product.offer.kind === "percent"
                    ? `${Math.round(product.offer.value)}% off`
                    : `₹${Math.round(product.offer.value)} off`)}
                {product.offer.endsAt
                  ? ` · ends ${new Date(product.offer.endsAt).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}`
                  : ""}
              </p>
            ) : null}
            {product.subcategory ? <p className="text-sm text-mute">{product.subcategory}</p> : null}
          </div>

          {product.description ? (
            <p className="max-w-prose text-sm leading-relaxed text-mute">{product.description}</p>
          ) : null}

          {displayAttributes.length > 0 ? (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
              {displayAttributes.map((row) => (
                <div key={row.key}>
                  <dt className="text-mute">{row.label}</dt>
                  <dd className="font-medium">{row.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          {multiVariant ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">Size</p>
              <div className="flex flex-wrap gap-2">
                {variants.map((variant) => {
                  const unavailable = !variant.active || variant.stock === 0;
                  return (
                    <button
                      key={variant.id}
                      type="button"
                      disabled={unavailable}
                      onClick={() => setVariantId(variant.id)}
                      className={cn(
                        "h-10 min-w-10 rounded-full px-4 text-sm font-medium disabled:opacity-40",
                        !unavailable && variantId === variant.id
                          ? "bg-ink text-canvas"
                          : "bg-canvas ring-1 ring-inset ring-hairline",
                      )}
                    >
                      {variantLabel(variant)}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="flex max-w-sm flex-col gap-2 sm:flex-row sm:flex-wrap">
            <button
              type="button"
              disabled={pending || soldOut || (multiVariant && !selectedVariant)}
              onClick={() => void addToBag()}
              className="h-12 w-full rounded-full bg-ink px-8 text-base font-medium text-canvas disabled:opacity-50 sm:w-auto"
            >
              {pending ? "Adding…" : soldOut ? "Sold out" : "Add to bag"}
            </button>
            {canTryOnSingle ? (
              <button
                type="button"
                onClick={() => setTrialOpen(true)}
                className="h-12 w-full rounded-full bg-soft-cloud px-8 text-base font-medium text-ink sm:w-auto"
              >
                Add to trial room
              </button>
            ) : null}
          </div>
          {!product.canTryOn ? (
            <p className="text-xs text-mute">
              Virtual try-on needs a cutout for this piece. Browse other shop items
              that support it.
            </p>
          ) : (
            <p className="text-xs text-mute">
              Add pieces to your trial room from any store, then try the full look
              on you.
            </p>
          )}
        </div>
      </div>

      {infoSections.length > 0 ? (
        <section className="border-t border-hairline" aria-label="Product information">
          {infoSections.map((section) => (
            <details key={section.id} className="group border-b border-hairline">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-6 text-base font-medium tracking-tight [&::-webkit-details-marker]:hidden">
                <span>{section.title}</span>
                <Plus className="size-4 shrink-0 transition group-open:rotate-45" aria-hidden />
              </summary>
              <div className="pb-6 text-sm leading-relaxed text-mute">
                {section.kind === "rich_text" ? (
                  <p className="whitespace-pre-wrap">{section.body}</p>
                ) : (
                  <dl className="space-y-3">
                    {(section.rows ?? []).map((row) => (
                      <div key={`${section.id}-${row.label}`}>
                        <dt className="font-medium text-ink">{row.label}</dt>
                        <dd className="mt-1 whitespace-pre-wrap">{row.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
            </details>
          ))}
        </section>
      ) : null}

      {look.length > 0 ? (
        <section className="space-y-4" aria-label="Shop the look">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="text-lg font-medium tracking-tight">Shop the look</h2>
            {canTryOnLook ? (
              <button
                type="button"
                disabled={pendingLook}
                onClick={() => void addLookToTrialRoom()}
                className="h-10 rounded-full bg-soft-cloud px-5 text-sm font-medium text-ink disabled:opacity-50"
              >
                {pendingLook ? "Adding…" : "Add look to trial room"}
              </button>
            ) : null}
          </div>
          <ul className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
            {look.map((sibling) => (
              <li key={sibling.id} className="space-y-2">
                <Link
                  href={routes.storeProduct(sibling.vendorSlug, sibling.slug)}
                  className="block space-y-2"
                >
                  <div className="aspect-square bg-soft-cloud">
                    {sibling.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={sibling.imageUrl} alt="" className="h-full w-full object-cover" />
                    ) : null}
                  </div>
                  <p className="truncate text-sm font-medium">{sibling.name}</p>
                  <p className="text-sm">{formatInr(sibling.priceInr)}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {canTryOnSingle ? (
        <AddToTrialRoomSheet
          open={trialOpen}
          onOpenChange={setTrialOpen}
          productId={product.id}
          suggestedSlot={product.tryOnSlot}
          productName={product.name}
        />
      ) : null}
    </div>
  );
}
