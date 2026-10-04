"use client";

import { useQuery } from "convex/react";
import { Images, Store } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import { EmptyState } from "@/components/common/EmptyState";
import { AppHeaderTitle } from "@/components/layout/app-header";
import { cn } from "@/lib/cn";
import { formatInr } from "@/lib/format";
import { routes } from "@/lib/routes";

type Tab = "looks" | "stores";

export function ShopCatalog() {
  const [tab, setTab] = useState<Tab>("looks");
  const stores = useQuery(api.products.listMarketplaceStores, {});
  const looks = useQuery(api.products.listMarketplaceLooks, {});

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8">
      <AppHeaderTitle title="Shop" />
      <header className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-mute sm:text-sm">
          Marketplace
        </p>
        <h1 className="font-display text-3xl font-medium uppercase leading-[0.9] tracking-tight sm:text-5xl">
          Shop.
        </h1>
        <p className="max-w-md text-sm text-mute sm:text-base">
          Shop the look across open stores, or browse a store&apos;s full catalog.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["looks", "Shop the look"],
            ["stores", "Stores"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "h-10 rounded-full px-4 text-sm font-medium",
              tab === id ? "bg-ink text-canvas" : "bg-canvas ring-1 ring-inset ring-hairline",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "looks" ? (
        looks === undefined ? (
          <div className="h-64 animate-pulse bg-soft-cloud" />
        ) : looks.length === 0 ? (
          <EmptyState
            icon={Images}
            title="No looks yet"
            description="When stores extract multiple pieces from one photo, those looks show up here."
          />
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {looks.map((look) => {
              const hero = look.products[0];
              return (
                <li key={`${look.vendorSlug}:${look.uploadId}`} className="space-y-2">
                  <div className="relative aspect-[4/5] overflow-hidden bg-soft-cloud">
                    <Link
                      href={
                        hero
                          ? routes.storeProduct(look.vendorSlug, hero.slug)
                          : routes.store(look.vendorSlug)
                      }
                      className="absolute inset-0 block"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={look.imageUrl} alt="" className="size-full object-cover" />
                    </Link>
                    <div className="absolute inset-x-0 bottom-0 flex gap-1 p-2">
                      {look.products.slice(0, 4).map((product) => (
                        <Link
                          key={product.id}
                          href={routes.storeProduct(look.vendorSlug, product.slug)}
                          className="size-12 overflow-hidden bg-canvas"
                          title={product.name}
                        >
                          {product.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={product.imageUrl}
                              alt={product.name}
                              className="size-full object-contain"
                            />
                          ) : null}
                        </Link>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1 px-1">
                    <Link
                      href={routes.store(look.vendorSlug)}
                      className="text-sm font-medium text-ink hover:underline"
                    >
                      {look.vendorName}
                    </Link>
                    <p className="text-xs text-mute">
                      {look.products.length} {look.products.length === 1 ? "piece" : "pieces"} ·{" "}
                      {formatInr(look.totalInr)} for the look
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )
      ) : stores === undefined ? (
        <div className="h-64 animate-pulse bg-soft-cloud" />
      ) : stores.length === 0 ? (
        <EmptyState
          icon={Store}
          title="No stores open"
          description="Approved vendor stores will appear here."
        />
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {stores.map((store) => (
            <li key={store._id}>
              <Link
                href={routes.store(store.slug)}
                className="group block space-y-3 transition-opacity hover:opacity-90"
              >
                <div className="aspect-square overflow-hidden bg-soft-cloud">
                  {store.logoUrl || store.bannerUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={store.logoUrl ?? store.bannerUrl ?? ""}
                      alt=""
                      className="size-full object-cover"
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center text-mute">
                      <Store className="size-8" aria-hidden />
                    </div>
                  )}
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-ink">{store.name}</p>
                  {store.description ? (
                    <p className="line-clamp-2 text-xs text-mute">{store.description}</p>
                  ) : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
