"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Percent, Plus, Search, Trash2 } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  OFFER_KINDS,
  PRODUCT_CATEGORIES,
  PRODUCT_CATEGORY_LABELS,
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

type Filter = "all" | "on" | "off" | "code" | "auto";

type Form = {
  name: string;
  code: string;
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
  startsAt: string;
  endsAt: string;
  active: boolean;
};

function toLocalInput(ms: number): string {
  const date = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function emptyForm(): Form {
  return {
    name: "",
    code: "",
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
    startsAt: toLocalInput(Date.now()),
    endsAt: "",
    active: true,
  };
}

function fromView(discount: DiscountView): Form {
  return {
    name: discount.name,
    code: discount.code ?? "",
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
      code: rows.filter((d) => Boolean(d.code)).length,
      auto: rows.filter((d) => !d.code).length,
    };
  }, [discounts]);

  const filtered = useMemo(() => {
    if (!discounts) return [];
    const q = query.trim().toLowerCase();
    return discounts.filter((discount) => {
      if (filter === "on" && !discount.active) return false;
      if (filter === "off" && discount.active) return false;
      if (filter === "code" && !discount.code) return false;
      if (filter === "auto" && discount.code) return false;
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
    { id: "code", label: "With code", count: counts.code },
    { id: "auto", label: "Automatic", count: counts.auto },
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
            description="Launch an offer with a code, or apply an automatic cut at checkout."
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
                    {discount.code ? (
                      <span className="rounded-full bg-soft-cloud px-2.5 py-0.5 font-mono text-xs font-medium tracking-wide">
                        {discount.code}
                      </span>
                    ) : (
                      <span className="rounded-full bg-soft-cloud px-2.5 py-0.5 text-xs font-medium text-mute">
                        Automatic
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
  const products = useQuery(api.vendorProducts.list, { paginationOpts: { numItems: 100, cursor: null } });
  const [form, setForm] = useState<Form>(discount ? fromView(discount) : emptyForm());
  const [pending, setPending] = useState(false);
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    try {
      const args = {
        name: form.name,
        code: form.code.trim() || undefined,
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
        startsAt: new Date(form.startsAt).getTime(),
        endsAt: form.endsAt ? new Date(form.endsAt).getTime() : undefined,
        active: form.active,
      };
      if (discount) await update({ discountId: discount.id, ...args });
      else await create(args);
      toast.success(discount ? "Discount updated." : "Discount created.");
      onClose();
    } catch (error) {
      toast.error(reportError(error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{discount ? "Edit discount" : "New discount"}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-mute">
            Leave the code blank for an automatic checkout offer. Add a code if shoppers should type it in.
          </p>
          <Field label="Name">
            <Input
              required
              autoFocus
              maxLength={80}
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Diwali Offer"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Promo code" hint="Optional. Blank = automatic.">
              <Input
                maxLength={24}
                value={form.code}
                onChange={(e) => set("code", e.target.value.toUpperCase())}
                placeholder="LAUNCH10"
              />
            </Field>
            <Field label={form.kind === "percent" ? "Percent off" : "Amount off (INR)"}>
              <span className="flex gap-2">
                <select
                  value={form.kind}
                  onChange={(e) => set("kind", e.target.value as Form["kind"])}
                  className="h-12 shrink-0 rounded-full bg-soft-cloud px-3 text-sm"
                  aria-label="Discount kind"
                >
                  <option value="percent">%</option>
                  <option value="flat">₹</option>
                </select>
                <Input
                  type="number"
                  required
                  min={1}
                  value={form.value}
                  onChange={(e) => set("value", e.target.value)}
                />
              </span>
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Offer type">
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
            <Field label="Badge" hint="Shown on product cards when live.">
              <Input
                maxLength={40}
                value={form.badge}
                onChange={(e) => set("badge", e.target.value)}
                placeholder="Diwali Sale"
              />
            </Field>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Applies to</legend>
            <div className="flex flex-wrap gap-2">
              {(["all", "category", "collection", "products", "attribute"] as const).map((scope) => (
                <button
                  key={scope}
                  type="button"
                  onClick={() => set("scope", scope)}
                  className={cn(
                    "h-9 rounded-full px-3 text-sm font-medium transition active:scale-95 active:opacity-50",
                    form.scope === scope
                      ? "bg-ink text-canvas"
                      : "bg-canvas text-ink ring-1 ring-inset ring-hairline",
                  )}
                >
                  {
                    {
                      all: "Everything",
                      category: "Categories",
                      collection: "A collection",
                      products: "Chosen products",
                      attribute: "Attribute",
                    }[scope]
                  }
                </button>
              ))}
            </div>
          </fieldset>
          {form.scope === "category" ? (
            <div className="flex flex-wrap gap-2">
              {PRODUCT_CATEGORIES.map((category) => {
                const on = form.categories.includes(category);
                return (
                  <button
                    key={category}
                    type="button"
                    onClick={() =>
                      set(
                        "categories",
                        on ? form.categories.filter((c) => c !== category) : [...form.categories, category],
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
              className="h-12 w-full rounded-full bg-soft-cloud px-4 text-sm"
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
            <ul className="max-h-48 space-y-1 overflow-y-auto border border-hairline p-2">
              {products?.page.map((product) => {
                const on = form.productIds.includes(product.id);
                return (
                  <li key={product.id}>
                    <label className="flex items-center gap-2 text-sm">
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
                      <span className="truncate">{product.name}</span>
                      <span className="ml-auto text-xs text-mute">{formatInr(product.priceInr)}</span>
                    </label>
                  </li>
                );
              })}
              {products && products.page.length === 0 ? (
                <li className="p-2 text-sm text-mute">No products yet.</li>
              ) : null}
            </ul>
          ) : null}
          {form.scope === "attribute" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Attribute key" hint="e.g. occasion, sale">
                <Input
                  required
                  value={form.attributeKey}
                  onChange={(e) => set("attributeKey", e.target.value)}
                  placeholder="occasion"
                />
              </Field>
              <Field label="Values" hint="Comma-separated">
                <Input
                  required
                  value={form.attributeValues}
                  onChange={(e) => set("attributeValues", e.target.value)}
                  placeholder="festive, wedding"
                />
              </Field>
            </div>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Starts">
              <Input
                type="datetime-local"
                required
                value={form.startsAt}
                onChange={(e) => set("startsAt", e.target.value)}
              />
            </Field>
            <Field label="Ends" hint="Optional.">
              <Input
                type="datetime-local"
                value={form.endsAt}
                onChange={(e) => set("endsAt", e.target.value)}
              />
            </Field>
            <Field label="Minimum order (INR)">
              <Input
                type="number"
                min={0}
                value={form.minOrderInr}
                onChange={(e) => set("minOrderInr", e.target.value)}
              />
            </Field>
            <Field label="Max uses">
              <Input
                type="number"
                min={1}
                value={form.maxUses}
                onChange={(e) => set("maxUses", e.target.value)}
              />
            </Field>
          </div>
          <label className="flex h-12 items-center justify-between rounded-full bg-soft-cloud px-4 text-sm font-medium">
            Active now
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => set("active", e.target.checked)}
              className="size-5 accent-ink"
            />
          </label>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
