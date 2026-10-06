"use client";

import { useQuery } from "convex/react";
import { Mail, MessageCircle, ShoppingBag } from "lucide-react";
import { api } from "@convex/_generated/api";
import { EmptyState } from "@/components/common/EmptyState";
import { formatDate, formatInr } from "@/lib/format";

function whatsappHref(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 8) return null;
  const withCountry = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${withCountry}`;
}

function addedFromLabel(addedFrom: string | null): string | null {
  if (!addedFrom) return null;
  const labels: Record<string, string> = {
    similar: "Similar items",
    outfit: "Outfit",
    agent: "Stylist",
    rail: "Shop rail",
    store: "Storefront",
  };
  return labels[addedFrom] ?? addedFrom;
}

export function VendorCartList() {
  const data = useQuery(api.vendorCarts.list, {});

  if (data === undefined) {
    return <div className="h-40 animate-pulse bg-soft-cloud" />;
  }

  if (data.shoppers.length === 0) {
    return (
      <div className="space-y-6">
        <p className="text-sm text-mute">
          Shoppers who added your products but have not checked out yet. Reach out by email or
          WhatsApp.
        </p>
        <EmptyState
          icon={ShoppingBag}
          title="No open carts"
          description="When someone adds your pieces to their bag, they show up here with contact details."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-mute">
          Shoppers who added your products but have not checked out yet. Reach out by email or
          WhatsApp.
        </p>
        <p className="text-sm text-mute">
          {data.shopperCount} shopper{data.shopperCount === 1 ? "" : "s"} · {data.lineCount} item
          {data.lineCount === 1 ? "" : "s"}
        </p>
      </div>

      <ul className="divide-y divide-hairline border-y border-hairline">
        {data.shoppers.map((shopper) => {
          const wa = shopper.phone ? whatsappHref(shopper.phone) : null;
          return (
            <li key={shopper.userId} className="space-y-4 py-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="truncate text-sm font-medium">{shopper.name}</p>
                  <p className="truncate text-xs text-mute">
                    Updated {formatDate(shopper.cartUpdatedAt)} · {shopper.itemCount} item
                    {shopper.itemCount === 1 ? "" : "s"}
                    {shopper.email ? ` · ${shopper.email}` : ""}
                    {shopper.phone ? ` · ${shopper.phone}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium">{formatInr(shopper.totalInr)}</p>
                  {shopper.email ? (
                    <a
                      href={`mailto:${encodeURIComponent(shopper.email)}?subject=${encodeURIComponent("About the items in your bag")}`}
                      className="inline-flex h-10 items-center gap-1.5 rounded-full bg-soft-cloud px-4 text-sm font-medium text-ink transition active:scale-95 active:opacity-50"
                    >
                      <Mail className="size-4" aria-hidden />
                      Email
                    </a>
                  ) : null}
                  {wa ? (
                    <a
                      href={wa}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-10 items-center gap-1.5 rounded-full bg-ink px-4 text-sm font-medium text-canvas transition active:scale-95 active:opacity-50"
                    >
                      <MessageCircle className="size-4" aria-hidden />
                      WhatsApp
                    </a>
                  ) : null}
                </div>
              </div>

              <ul className="space-y-3">
                {shopper.lines.map((line) => {
                  const source = addedFromLabel(line.addedFrom);
                  return (
                    <li key={line.id} className="flex gap-3">
                      <div className="size-16 shrink-0 overflow-hidden bg-soft-cloud">
                        {line.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={line.imageUrl} alt="" className="size-full object-cover" />
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <p className="truncate text-sm font-medium">{line.name}</p>
                        <p className="text-xs text-mute">
                          Qty {line.quantity}
                          {line.variantLabel ? ` · ${line.variantLabel}` : ""}
                          {source ? ` · ${source}` : ""}
                          {!line.available ? " · Unavailable" : ""}
                        </p>
                        <p className="text-sm font-medium">{formatInr(line.priceInr * line.quantity)}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
