"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Percent, Plus, Search, Trash2 } from "lucide-react";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  OFFER_KINDS,
  PRODUCT_CATEGORIES,
  PRODUCT_CATEGORY_LABELS,
  type DiscountRedemption,
  type OfferKind,
  type ProductCategory,
} from "@convex/shared/products";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/vendor/VendorProfileForm";
import { useNow } from "@/hooks/use-now";
import { reportError } from "@/lib/client-errors";
import { cn } from "@/lib/cn";
import { formatDate, formatInr } from "@/lib/format";

type DiscountView = FunctionReturnType<typeof api.vendorDiscounts.list>[number];

type Filter = "all" | "on" | "off" | "auto" | "clip" | "code";

type Form = {
  name: string;
  code: string;
  redemption: DiscountRedemption;
  kind: "percent" | "flat";
  value: string;
  scope: "all" | "category" | "collection" | "products" | "attribute";
  offerKind: OfferKind;
  badge: string;
  categories: ProductCategory[];
  collectionId: string;
  productIds: Id<"products">[];
  attributeKey: string;
  attributeValues: string;
  minOrderInr: string;
  maxUses: string;
  maxUsesPerUser: string;
  startsAt: string;
  endsAt: string;
  active: boolean;
};

function redemptionLabel(redemption: DiscountRedemption): string {
  if (redemption === "clip") return "Clip coupon";
  if (redemption === "code") return "Promo code";
  return "Automatic";
}

const REDEMPTION_OPTIONS: {
  id: DiscountRedemption;
  title: string;
  description: string;
}[] = [
  {
    id: "auto",
    title: "Automatic",
    description: "Sale price shows on product cards and in the bag — no code needed.",
  },
  {
    id: "clip",
    title: "Clip coupon",
    description: "Shoppers clip on the product page; discount applies at checkout.",
  },
  {
    id: "code",
    title: "Promo code",
    description: "Share a code for checkout. One code per store in a mixed bag.",
  },
];

const SCOPE_OPTIONS: { id: Form["scope"]; label: string }[] = [
  { id: "all", label: "Everything" },
  { id: "category", label: "Categories" },
  { id: "collection", label: "Collection" },
  { id: "products", label: "Products" },
  { id: "attribute", label: "Attribute" },
];

function formPreview(form: Form): string {
  const amount =
    form.kind === "percent"
      ? `${form.value || "0"}% off`
      : form.value
        ? `${formatInr(Number(form.value) || 0)} off`
        : "₹0 off";
  if (form.redemption === "code" && form.code.trim()) {
    return `${amount} · code ${form.code.trim().toUpperCase()}`;
  }
  if (form.badge.trim()) return `${amount} · “${form.badge.trim()}”`;
  return amount;
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3 border-t border-hairline pt-4 first:border-t-0 first:pt-0">
      <div className="space-y-0.5">
        <h3 className="text-sm font-medium text-ink">{title}</h3>
        {description ? <p className="text-xs text-mute">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function toLocalInput(ms: number): string {
  const date = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function emptyForm(): Form {
  return {
    name: "",
    code: "",
    redemption: "auto",
    kind: "percent",
    value: "10",
    scope: "all",
    offerKind: "standard",
    badge: "",
    categories: [],
    collectionId: "",
    productIds: [],
    attributeKey: "",
    attributeValues: "",
    minOrderInr: "",
    maxUses: "",
    maxUsesPerUser: "",
    startsAt: toLocalInput(Date.now()),
    endsAt: "",
    active: true,
  };
}

function fromView(discount: DiscountView): Form {
  return {
    name: discount.name,
    code: discount.code ?? "",
    redemption: discount.redemption,
    kind: discount.kind,
    value: String(discount.value),
    scope: discount.scope,
    offerKind: discount.offerKind,
    badge: discount.badge ?? "",
    categories: discount.categories,
    collectionId: discount.collectionId ?? "",
    productIds: discount.productIds,
    attributeKey: discount.attributeKey ?? "",
    attributeValues: discount.attributeValues.join(", "),
    minOrderInr: discount.minOrderInr ? String(discount.minOrderInr) : "",
    maxUses: discount.maxUses ? String(discount.maxUses) : "",
    maxUsesPerUser: discount.maxUsesPerUser ? String(discount.maxUsesPerUser) : "",
    startsAt: toLocalInput(discount.startsAt),
    endsAt: discount.endsAt ? toLocalInput(discount.endsAt) : "",
    active: discount.active,
  };
}

function offerLabel(discount: DiscountView): string {
  return discount.kind === "percent" ? `${discount.value}% off` : `${formatInr(discount.value)} off`;
}

function scopeLabel(discount: DiscountView): string {
  if (discount.scope === "all") return "Everything";
  if (discount.scope === "category") {
    return discount.categories.map((c) => PRODUCT_CATEGORY_LABELS[c]).join(", ") || "Categories";
  }
  if (discount.scope === "collection") return "One collection";
  return `${discount.productIds.length} product${discount.productIds.length === 1 ? "" : "s"}`;
}

function scheduleLabel(discount: DiscountView, now: number): "Live" | "Scheduled" | "Ended" {
  if (discount.endsAt && discount.endsAt < now) return "Ended";
  if (discount.startsAt > now) return "Scheduled";
  return "Live";
}

export function VendorDiscounts() {
  const now = useNow();
  const discounts = useQuery(api.vendorDiscounts.list, {});
  const setActive = useMutation(api.vendorDiscounts.setActive);
  const remove = useMutation(api.vendorDiscounts.remove);
  const [editing, setEditing] = useState<DiscountView | "new" | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const counts = useMemo(() => {
    const rows = discounts ?? [];
    return {
      all: rows.length,
      on: rows.filter((d) => d.active).length,
      off: rows.filter((d) => !d.active).length,
      auto: rows.filter((d) => d.redemption === "auto").length,
      clip: rows.filter((d) => d.redemption === "clip").length,
      code: rows.filter((d) => d.redemption === "code").length,
    };
  }, [discounts]);

  const filtered = useMemo(() => {
    if (!discounts) return [];
    const q = query.trim().toLowerCase();
    return discounts.filter((discount) => {
      if (filter === "on" && !discount.active) return false;
      if (filter === "off" && discount.active) return false;
      if (filter === "auto" && discount.redemption !== "auto") return false;
      if (filter === "clip" && discount.redemption !== "clip") return false;
      if (filter === "code" && discount.redemption !== "code") return false;
      if (!q) return true;
      return (
        discount.name.toLowerCase().includes(q) ||
        (discount.code?.toLowerCase().includes(q) ?? false) ||
        offerLabel(discount).toLowerCase().includes(q)
      );
    });
  }, [discounts, filter, query]);

  const filters: { id: Filter; label: string; count: number }[] = [
    { id: "all", label: "All", count: counts.all },
    { id: "on", label: "On", count: counts.on },
    { id: "off", label: "Off", count: counts.off },
    { id: "auto", label: "Automatic", count: counts.auto },
    { id: "clip", label: "Clip coupons", count: counts.clip },
    { id: "code", label: "Promo codes", count: counts.code },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="sticky top-0 z-20 shrink-0 bg-canvas">
        <div className="flex h-14 items-center justify-between gap-3 border-b border-hairline px-4">
          <div className="min-w-0">
            <h2 className="text-xl font-medium tracking-tight text-ink">Discounts</h2>
          </div>
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus />
            New discount
          </Button>
        </div>

        {discounts && discounts.length > 0 ? (
          <>
            <div className="border-b border-hairline px-4 py-3">
              <div className="flex gap-2 overflow-x-auto">
                {filters.map((item) => {
                  const active = filter === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setFilter(item.id)}
                      className={cn(
                        "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition active:scale-95 active:opacity-50",
                        active ? "bg-ink text-canvas" : "bg-canvas text-ink ring-1 ring-inset ring-hairline",
                      )}
                    >
                      {item.label}
                      <span className={cn("tabular-nums text-xs", active ? "text-canvas/70" : "text-mute")}>
                        {item.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="border-b border-hairline px-4 py-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-mute" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by name or code…"
                  className="h-11 w-full rounded-none pl-10 text-sm"
                  aria-label="Search discounts"
                />
              </div>
            </div>
          </>
        ) : null}
      </div>

      {discounts === undefined ? (
        <div className="min-h-0 flex-1 animate-pulse bg-soft-cloud" />
      ) : discounts.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-4">
          <EmptyState
            icon={Percent}
            title="No discounts yet"
            description="Create automatic deals, clip coupons for the PDP, or promo codes for checkout."
            action={<Button onClick={() => setEditing("new")}>New discount</Button>}
          />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-4">
          <EmptyState
            icon={Search}
            title="No matches"
            description="Try another filter or clear the search."
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  setFilter("all");
                  setQuery("");
                }}
              >
                Clear filters
              </Button>
            }
          />
        </div>
      ) : (
        <ul className="min-h-0 flex-1 divide-y divide-hairline overflow-y-auto">
          {filtered.map((discount) => {
            const schedule = scheduleLabel(discount, now);
            return (
              <li
                key={discount.id}
                className={cn(
                  "flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center",
                  !discount.active && "bg-soft-cloud/40",
                )}
              >
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-medium text-ink">{discount.name}</p>
                    {discount.redemption === "code" && discount.code ? (
                      <span className="rounded-full bg-soft-cloud px-2.5 py-0.5 font-mono text-xs font-medium tracking-wide">
                        {discount.code}
                      </span>
                    ) : (
                      <span className="rounded-full bg-soft-cloud px-2.5 py-0.5 text-xs font-medium text-mute">
                        {redemptionLabel(discount.redemption)}
                      </span>
                    )}
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-xs font-medium",
                        schedule === "Live" && discount.active && "bg-soft-cloud text-success",
                        schedule === "Live" && !discount.active && "bg-soft-cloud text-mute",
                        schedule === "Scheduled" && "bg-soft-cloud text-ink",
                        schedule === "Ended" && "bg-canvas text-mute ring-1 ring-inset ring-hairline",
                      )}
                    >
                      {schedule}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-mute">
                    <span className="font-medium text-ink">{offerLabel(discount)}</span>
                    <span>{scopeLabel(discount)}</span>
                    <span>
                      {formatDate(discount.startsAt)}
                      {discount.endsAt ? ` – ${formatDate(discount.endsAt)}` : " – open end"}
                    </span>
                    <span className="tabular-nums">
                      {discount.maxUses
                        ? `${discount.usedCount}/${discount.maxUses} used`
                        : `${discount.usedCount} used`}
                    </span>
                    {discount.minOrderInr ? (
                      <span>Min {formatInr(discount.minOrderInr)}</span>
                    ) : null}
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <button
                    type="button"
                    aria-pressed={discount.active}
                    aria-label={discount.active ? "Turn discount off" : "Turn discount on"}
                    onClick={() =>
                      void setActive({ discountId: discount.id, active: !discount.active })
                        .then(() => toast.success(discount.active ? "Discount turned off." : "Discount turned on."))
                        .catch((e) => toast.error(reportError(e).message))
                    }
                    className={cn(
                      "inline-flex h-10 items-center rounded-full px-4 text-sm font-medium transition active:scale-95 active:opacity-50",
                      discount.active ? "bg-ink text-canvas" : "bg-canvas text-mute ring-1 ring-inset ring-hairline",
                    )}
                  >
                    {discount.active ? "On" : "Off"}
                  </button>
                  <Button variant="secondary" size="sm" onClick={() => setEditing(discount)}>
                    Edit
                  </Button>
                  <ConfirmDialog
                    trigger={
                      <Button variant="ghost" size="icon-sm" aria-label={`Delete ${discount.name}`}>
                        <Trash2 className="size-4 text-sale" />
                      </Button>
                    }
                    title="Delete this discount?"
                    description="Shoppers won’t be able to use it again."
                    confirmLabel="Delete"
                    destructive
                    onConfirm={async () => {
                      await remove({ discountId: discount.id });
                      toast.success("Discount deleted.");
                    }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {editing ? (
        <DiscountDialog discount={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
      ) : null}
    </div>
  );
}

function DiscountDialog({ discount, onClose }: { discount: DiscountView | null; onClose: () => void }) {
  const create = useMutation(api.vendorDiscounts.create);
  const update = useMutation(api.vendorDiscounts.update);
  const collections = useQuery(api.vendorCollections.list, {});
  const [form, setForm] = useState<Form>(discount ? fromView(discount) : emptyForm());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [productQuery, setProductQuery] = useState("");
  const products = useQuery(api.vendorProducts.pickerSearch, {
    q: productQuery.trim() || undefined,
    limit: 40,
  });
  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setError(null);
    setForm((f) => ({ ...f, [key]: value }));
  };

  const filteredProducts = products ?? [];

  function validate(): string | null {
    if (!form.name.trim()) return "Give this discount a name.";
    const value = Number(form.value);
    if (!Number.isFinite(value) || value <= 0) return "Enter a discount value greater than zero.";
    if (form.kind === "percent" && value > 90) return "Percent off is capped at 90%.";
    if (form.redemption === "code" && !form.code.trim()) return "Promo codes need a code shoppers can type.";
    if (form.scope === "category" && form.categories.length === 0) return "Pick at least one category.";
    if (form.scope === "collection" && !form.collectionId) return "Choose a collection.";
    if (form.scope === "products" && form.productIds.length === 0) return "Pick at least one product.";
    if (form.scope === "attribute") {
      if (!form.attributeKey.trim()) return "Enter an attribute key.";
      if (!form.attributeValues.split(",").map((p) => p.trim()).filter(Boolean).length) {
        return "Enter at least one attribute value.";
      }
    }
    const startsAt = new Date(form.startsAt).getTime();
    if (!Number.isFinite(startsAt)) return "Pick a valid start time.";
    if (form.endsAt) {
      const endsAt = new Date(form.endsAt).getTime();
      if (!Number.isFinite(endsAt) || endsAt <= startsAt) {
        return "End time must be after the start time.";
      }
    }
    return null;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setPending(true);
    setError(null);
    try {
      const args = {
        name: form.name,
        redemption: form.redemption,
        code: form.redemption === "code" ? form.code.trim() || undefined : undefined,
        kind: form.kind,
        value: Number(form.value),
        scope: form.scope,
        offerKind: form.offerKind,
        badge: form.badge.trim() || undefined,
        categories: form.scope === "category" ? form.categories : undefined,
        collectionId:
          form.scope === "collection" && form.collectionId
            ? (form.collectionId as Id<"collections">)
            : undefined,
        productIds: form.scope === "products" ? form.productIds : undefined,
        attributeKey: form.scope === "attribute" ? form.attributeKey.trim() : undefined,
        attributeValues:
          form.scope === "attribute"
            ? form.attributeValues.split(",").map((part) => part.trim()).filter(Boolean)
            : undefined,
        minOrderInr: form.minOrderInr ? Number(form.minOrderInr) : undefined,
        maxUses: form.maxUses ? Number(form.maxUses) : undefined,
        maxUsesPerUser:
          form.redemption !== "auto" && form.maxUsesPerUser
            ? Number(form.maxUsesPerUser)
            : undefined,
        startsAt: new Date(form.startsAt).getTime(),
        endsAt: form.endsAt ? new Date(form.endsAt).getTime() : undefined,
        active: form.active,
      };
      if (discount) await update({ discountId: discount.id, ...args });
      else await create(args);
      toast.success(discount ? "Discount updated." : "Discount created.");
      onClose();
    } catch (err) {
      const message = reportError(err).message;
      setError(message);
      toast.error(message);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 space-y-3 border-b border-hairline px-4 pb-4 pt-4 pr-12">
            <DialogHeader>
              <DialogTitle>{discount ? "Edit discount" : "New discount"}</DialogTitle>
            </DialogHeader>
            <div className="rounded-none bg-soft-cloud px-4 py-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-mute">Preview</p>
              <p className="mt-1 text-sm font-medium text-ink">{formPreview(form)}</p>
              <p className="mt-0.5 text-xs text-mute">
                {REDEMPTION_OPTIONS.find((o) => o.id === form.redemption)?.description}
              </p>
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-0 overflow-y-auto px-4 py-4">
            <Section title="Type" description="How shoppers discover and redeem this offer.">
              <div className="grid gap-2">
                {REDEMPTION_OPTIONS.map((option) => {
                  const selected = form.redemption === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => {
                        setError(null);
                        setForm((f) => ({
                          ...f,
                          redemption: option.id,
                          code: option.id === "code" ? f.code : "",
                        }));
                      }}
                      className={cn(
                        "rounded-none px-4 py-3 text-left transition active:scale-[0.99] active:opacity-50",
                        selected
                          ? "bg-ink text-canvas"
                          : "bg-canvas text-ink ring-1 ring-inset ring-hairline",
                      )}
                    >
                      <p className="text-sm font-medium">{option.title}</p>
                      <p className={cn("mt-0.5 text-xs", selected ? "text-canvas/70" : "text-mute")}>
                        {option.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </Section>

            <Section title="Basics">
              <div className="space-y-4">
                <Field label="Internal name">
                  <Input
                    required
                    autoFocus
                    maxLength={80}
                    value={form.name}
                    onChange={(e) => set("name", e.target.value)}
                    placeholder="Diwali weekend push"
                  />
                </Field>

                {form.redemption === "code" ? (
                  <Field label="Promo code" hint="Letters, numbers, _ and - only. Shown uppercase.">
                    <Input
                      required
                      maxLength={24}
                      value={form.code}
                      onChange={(e) => set("code", e.target.value.toUpperCase())}
                      placeholder="LAUNCH10"
                      className="font-mono tracking-wide"
                    />
                  </Field>
                ) : null}

                <div className="space-y-2">
                  <p className="text-sm font-medium">Discount</p>
                  <div className="flex gap-2">
                    <div className="flex shrink-0 rounded-full bg-soft-cloud p-1">
                      {(["percent", "flat"] as const).map((kind) => (
                        <button
                          key={kind}
                          type="button"
                          onClick={() => set("kind", kind)}
                          className={cn(
                            "h-10 min-w-12 rounded-full px-3 text-sm font-medium transition active:scale-95 active:opacity-50",
                            form.kind === kind ? "bg-ink text-canvas" : "text-mute",
                          )}
                        >
                          {kind === "percent" ? "%" : "₹"}
                        </button>
                      ))}
                    </div>
                    <Input
                      type="number"
                      required
                      min={1}
                      max={form.kind === "percent" ? 90 : undefined}
                      value={form.value}
                      onChange={(e) => set("value", e.target.value)}
                      placeholder={form.kind === "percent" ? "10" : "200"}
                      aria-label={form.kind === "percent" ? "Percent off" : "Amount off in INR"}
                    />
                  </div>
                  <p className="text-xs text-mute">
                    {form.kind === "percent"
                      ? "Up to 90% off the sale price of eligible items."
                      : "Flat INR off the eligible subtotal for this store."}
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Offer style" hint="Merchandising label for reporting.">
                    <select
                      value={form.offerKind}
                      onChange={(e) => set("offerKind", e.target.value as OfferKind)}
                      className="h-12 w-full rounded-full bg-soft-cloud px-4 text-sm"
                    >
                      {OFFER_KINDS.map((kind) => (
                        <option key={kind} value={kind}>
                          {kind.charAt(0).toUpperCase() + kind.slice(1)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field
                    label="Shopper badge"
                    hint={
                      form.redemption === "clip"
                        ? "Shown next to the clip button."
                        : form.redemption === "auto"
                          ? "Shown on product cards when live."
                          : "Optional label in the bag summary."
                    }
                  >
                    <Input
                      maxLength={40}
                      value={form.badge}
                      onChange={(e) => set("badge", e.target.value)}
                      placeholder={form.redemption === "clip" ? "Clip & save" : "Diwali Sale"}
                    />
                  </Field>
                </div>
              </div>
            </Section>

            <Section title="Applies to" description="Only matching items from your store count.">
              <div className="flex flex-wrap gap-2">
                {SCOPE_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => set("scope", option.id)}
                    className={cn(
                      "h-9 rounded-full px-3 text-sm font-medium transition active:scale-95 active:opacity-50",
                      form.scope === option.id
                        ? "bg-ink text-canvas"
                        : "bg-canvas text-ink ring-1 ring-inset ring-hairline",
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              {form.scope === "category" ? (
                <div className="flex flex-wrap gap-2 pt-1">
                  {PRODUCT_CATEGORIES.map((category) => {
                    const on = form.categories.includes(category);
                    return (
                      <button
                        key={category}
                        type="button"
                        onClick={() =>
                          set(
                            "categories",
                            on
                              ? form.categories.filter((c) => c !== category)
                              : [...form.categories, category],
                          )
                        }
                        className={cn(
                          "h-9 rounded-full px-3 text-sm font-medium",
                          on ? "bg-ink text-canvas" : "bg-soft-cloud text-ink",
                        )}
                      >
                        {PRODUCT_CATEGORY_LABELS[category]}
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {form.scope === "collection" ? (
                <select
                  required
                  value={form.collectionId}
                  onChange={(e) => set("collectionId", e.target.value)}
                  className="mt-1 h-12 w-full rounded-full bg-soft-cloud px-4 text-sm"
                >
                  <option value="">Choose a collection</option>
                  {collections?.map((collection) => (
                    <option key={collection.id} value={collection.id}>
                      {collection.name}
                    </option>
                  ))}
                </select>
              ) : null}

              {form.scope === "products" ? (
                <div className="mt-1 space-y-2">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-mute" />
                    <Input
                      value={productQuery}
                      onChange={(e) => setProductQuery(e.target.value)}
                      placeholder="Search products…"
                      className="h-11 rounded-none pl-10 text-sm"
                      aria-label="Search products"
                    />
                  </div>
                  <p className="text-xs text-mute">
                    {form.productIds.length} selected
                    {filteredProducts.length ? ` · ${filteredProducts.length} shown` : null}
                  </p>
                  <ul className="max-h-48 divide-y divide-hairline overflow-y-auto border border-hairline">
                    {filteredProducts.map((product) => {
                      const on = form.productIds.includes(product.id);
                      return (
                        <li key={product.id}>
                          <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm hover:bg-soft-cloud/60">
                            <input
                              type="checkbox"
                              checked={on}
                              onChange={() =>
                                set(
                                  "productIds",
                                  on
                                    ? form.productIds.filter((id) => id !== product.id)
                                    : [...form.productIds, product.id],
                                )
                              }
                              className="size-4 accent-ink"
                            />
                            <span className="min-w-0 flex-1 truncate">{product.name}</span>
                            <span className="shrink-0 text-xs text-mute">
                              {formatInr(product.priceInr)}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                    {products && products.length === 0 ? (
                      <li className="px-3 py-4 text-sm text-mute">
                        {productQuery.trim() ? "No products match that search." : "No products yet."}
                      </li>
                    ) : null}
                  </ul>
                </div>
              ) : null}

              {form.scope === "attribute" ? (
                <div className="mt-1 grid gap-4 sm:grid-cols-2">
                  <Field label="Attribute key" hint="Matches products.attributes key, e.g. occasion">
                    <Input
                      required
                      value={form.attributeKey}
                      onChange={(e) => set("attributeKey", e.target.value)}
                      placeholder="occasion"
                    />
                  </Field>
                  <Field label="Values" hint="Comma-separated. Any match qualifies.">
                    <Input
                      required
                      value={form.attributeValues}
                      onChange={(e) => set("attributeValues", e.target.value)}
                      placeholder="festive, wedding"
                    />
                  </Field>
                </div>
              ) : null}
            </Section>

            <Section title="Schedule" description="Live window for this offer.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Starts">
                  <Input
                    type="datetime-local"
                    required
                    value={form.startsAt}
                    onChange={(e) => set("startsAt", e.target.value)}
                  />
                </Field>
                <Field label="Ends" hint="Leave blank for no end date.">
                  <Input
                    type="datetime-local"
                    value={form.endsAt}
                    onChange={(e) => set("endsAt", e.target.value)}
                  />
                </Field>
              </div>
            </Section>

            <Section
              title="Limits"
              description={
                form.redemption === "auto"
                  ? "Optional caps. Blank means unlimited."
                  : "Optional caps for redemptions. Blank means unlimited."
              }
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Minimum eligible spend (INR)"
                  hint="Based on this store’s matching items. Leave blank for none."
                >
                  <Input
                    type="number"
                    min={0}
                    value={form.minOrderInr}
                    onChange={(e) => set("minOrderInr", e.target.value)}
                    placeholder="No minimum"
                  />
                </Field>
                <Field label="Total redemptions" hint="Across all shoppers. Leave blank for unlimited.">
                  <Input
                    type="number"
                    min={1}
                    value={form.maxUses}
                    onChange={(e) => set("maxUses", e.target.value)}
                    placeholder="Unlimited"
                  />
                </Field>
                {form.redemption !== "auto" ? (
                  <Field label="Per shopper" hint="How many times one account can redeem.">
                    <Input
                      type="number"
                      min={1}
                      value={form.maxUsesPerUser}
                      onChange={(e) => set("maxUsesPerUser", e.target.value)}
                      placeholder="Unlimited"
                    />
                  </Field>
                ) : null}
              </div>
            </Section>

            <Section title="Status">
              <button
                type="button"
                role="switch"
                aria-checked={form.active}
                onClick={() => set("active", !form.active)}
                className={cn(
                  "flex h-12 w-full items-center justify-between rounded-full px-4 text-sm font-medium transition active:scale-[0.99] active:opacity-50",
                  form.active ? "bg-ink text-canvas" : "bg-soft-cloud text-mute",
                )}
              >
                <span>{form.active ? "Active — shoppers can use it" : "Inactive — hidden from shoppers"}</span>
                <span
                  className={cn(
                    "inline-flex h-6 w-11 items-center rounded-full p-0.5 transition",
                    form.active ? "bg-canvas/25" : "bg-hairline",
                  )}
                >
                  <span
                    className={cn(
                      "size-5 rounded-full bg-canvas transition",
                      form.active ? "translate-x-5" : "translate-x-0",
                    )}
                  />
                </span>
              </button>
            </Section>
          </div>

          <div className="shrink-0 space-y-3 border-t border-hairline bg-canvas px-4 py-4">
            {error ? <p className="text-sm text-sale">{error}</p> : null}
            <DialogFooter className="gap-2 sm:justify-end">
              <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : discount ? "Save changes" : "Create discount"}
              </Button>
            </DialogFooter>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
