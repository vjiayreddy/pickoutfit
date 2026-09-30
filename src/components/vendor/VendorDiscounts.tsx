"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Percent, Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { PRODUCT_CATEGORIES, PRODUCT_CATEGORY_LABELS, type ProductCategory } from "@convex/shared/products";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/vendor/VendorProfileForm";
import { reportError } from "@/lib/client-errors";
import { cn } from "@/lib/cn";
import { formatDate, formatInr } from "@/lib/format";

type DiscountView = FunctionReturnType<typeof api.vendorDiscounts.list>[number];

type Form = {
  name: string;
  code: string;
  kind: "percent" | "flat";
  value: string;
  scope: "all" | "category" | "collection" | "products";
  categories: ProductCategory[];
  collectionId: string;
  productIds: Id<"products">[];
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
    categories: [],
    collectionId: "",
    productIds: [],
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
    categories: discount.categories,
    collectionId: discount.collectionId ?? "",
    productIds: discount.productIds,
    minOrderInr: discount.minOrderInr ? String(discount.minOrderInr) : "",
    maxUses: discount.maxUses ? String(discount.maxUses) : "",
    startsAt: toLocalInput(discount.startsAt),
    endsAt: discount.endsAt ? toLocalInput(discount.endsAt) : "",
    active: discount.active,
  };
}

export function VendorDiscounts() {
  const discounts = useQuery(api.vendorDiscounts.list, {});
  const setActive = useMutation(api.vendorDiscounts.setActive);
  const remove = useMutation(api.vendorDiscounts.remove);
  const [editing, setEditing] = useState<DiscountView | "new" | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-mute">Automatic discounts apply at checkout. Ones with a code wait for the shopper to type it.</p>
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus />
          New discount
        </Button>
      </div>

      {discounts === undefined ? (
        <div className="h-40 animate-pulse bg-soft-cloud" />
      ) : discounts.length === 0 ? (
        <EmptyState icon={Percent} title="No discounts yet" description="Run a launch offer, clear a size, or reward a code." action={<Button onClick={() => setEditing("new")}>New discount</Button>} />
      ) : (
        <ul className="divide-y divide-hairline border-y border-hairline">
          {discounts.map((discount) => (
            <li key={discount.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {discount.name}
                  {discount.code ? <span className="ml-2 rounded-full bg-soft-cloud px-2 py-0.5 font-mono text-xs">{discount.code}</span> : null}
                </p>
                <p className="text-xs text-mute">
                  {discount.kind === "percent" ? `${discount.value}% off` : `${formatInr(discount.value)} off`} ·{" "}
                  {discount.scope === "all" ? "everything" : discount.scope === "category" ? discount.categories.map((c) => PRODUCT_CATEGORY_LABELS[c]).join(", ") : discount.scope === "collection" ? "one collection" : `${discount.productIds.length} products`}
                  {" · "}from {formatDate(discount.startsAt)}
                  {discount.endsAt ? ` to ${formatDate(discount.endsAt)}` : ""}
                  {discount.maxUses ? ` · ${discount.usedCount}/${discount.maxUses} used` : ` · ${discount.usedCount} used`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void setActive({ discountId: discount.id, active: !discount.active }).catch((e) => toast.error(reportError(e).message))}
                className={cn("h-8 rounded-full px-3 text-xs font-medium", discount.active ? "bg-ink text-canvas" : "bg-soft-cloud text-mute")}
              >
                {discount.active ? "On" : "Off"}
              </button>
              <Button variant="secondary" size="sm" onClick={() => setEditing(discount)}>
                Edit
              </Button>
              <ConfirmDialog
                trigger={<Button variant="ghost" size="sm">Delete</Button>}
                title="Delete this discount?"
                confirmLabel="Delete"
                destructive
                onConfirm={() => remove({ discountId: discount.id })}
              />
            </li>
          ))}
        </ul>
      )}

      {editing ? <DiscountDialog discount={editing === "new" ? null : editing} onClose={() => setEditing(null)} /> : null}
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
        categories: form.scope === "category" ? form.categories : undefined,
        collectionId: form.scope === "collection" && form.collectionId ? (form.collectionId as Id<"collections">) : undefined,
        productIds: form.scope === "products" ? form.productIds : undefined,
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
          <Field label="Name">
            <Input required maxLength={80} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Launch week" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Code (optional)" hint="Blank means it applies automatically.">
              <Input maxLength={24} value={form.code} onChange={(e) => set("code", e.target.value.toUpperCase())} placeholder="LAUNCH10" />
            </Field>
            <Field label={form.kind === "percent" ? "Percent off" : "Amount off (INR)"}>
              <span className="flex gap-2">
                <select value={form.kind} onChange={(e) => set("kind", e.target.value as Form["kind"])} className="h-12 shrink-0 rounded-full bg-soft-cloud px-3 text-sm">
                  <option value="percent">%</option>
                  <option value="flat">₹</option>
                </select>
                <Input type="number" required min={1} value={form.value} onChange={(e) => set("value", e.target.value)} />
              </span>
            </Field>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Applies to</legend>
            <div className="flex flex-wrap gap-2">
              {(["all", "category", "collection", "products"] as const).map((scope) => (
                <button key={scope} type="button" onClick={() => set("scope", scope)} className={cn("h-9 rounded-full px-3 text-sm font-medium", form.scope === scope ? "bg-ink text-canvas" : "bg-canvas ring-1 ring-inset ring-hairline")}>
                  {{ all: "Everything", category: "Categories", collection: "A collection", products: "Chosen products" }[scope]}
                </button>
              ))}
            </div>
          </fieldset>
          {form.scope === "category" ? (
            <div className="flex flex-wrap gap-2">
              {PRODUCT_CATEGORIES.map((category) => {
                const on = form.categories.includes(category);
                return (
                  <button key={category} type="button" onClick={() => set("categories", on ? form.categories.filter((c) => c !== category) : [...form.categories, category])} className={cn("h-9 rounded-full px-3 text-sm", on ? "bg-ink text-canvas" : "bg-soft-cloud")}>
                    {PRODUCT_CATEGORY_LABELS[category]}
                  </button>
                );
              })}
            </div>
          ) : null}
          {form.scope === "collection" ? (
            <select required value={form.collectionId} onChange={(e) => set("collectionId", e.target.value)} className="h-12 w-full rounded-full bg-soft-cloud px-4 text-sm">
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
                      <input type="checkbox" checked={on} onChange={() => set("productIds", on ? form.productIds.filter((id) => id !== product.id) : [...form.productIds, product.id])} className="size-4 accent-ink" />
                      <span className="truncate">{product.name}</span>
                      <span className="ml-auto text-xs text-mute">{formatInr(product.priceInr)}</span>
                    </label>
                  </li>
                );
              })}
              {products && products.page.length === 0 ? <li className="p-2 text-sm text-mute">No products yet.</li> : null}
            </ul>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Starts">
              <Input type="datetime-local" required value={form.startsAt} onChange={(e) => set("startsAt", e.target.value)} />
            </Field>
            <Field label="Ends (optional)">
              <Input type="datetime-local" value={form.endsAt} onChange={(e) => set("endsAt", e.target.value)} />
            </Field>
            <Field label="Minimum order (INR)">
              <Input type="number" min={0} value={form.minOrderInr} onChange={(e) => set("minOrderInr", e.target.value)} />
            </Field>
            <Field label="Max uses">
              <Input type="number" min={1} value={form.maxUses} onChange={(e) => set("maxUses", e.target.value)} />
            </Field>
          </div>
          <label className="flex h-12 items-center justify-between rounded-full bg-soft-cloud px-4 text-sm font-medium">
            Active
            <input type="checkbox" checked={form.active} onChange={(e) => set("active", e.target.checked)} className="size-5 accent-ink" />
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
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
