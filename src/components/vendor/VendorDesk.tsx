"use client";

import { useQuery } from "convex/react";
import {
  ClipboardList,
  FolderTree,
  Layers,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Percent,
  Settings,
  Store,
  Tags,
  Wallet,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "@convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { useNow } from "@/hooks/use-now";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/cn";
import { routes } from "@/lib/routes";

export type VendorMe = NonNullable<FunctionReturnType<typeof api.vendors.me>>;

const VendorContext = createContext<VendorMe | null>(null);

/** The vendor loaded by the desk layout. Only valid under `/vendor/*` desk pages. */
export function useVendor(): VendorMe {
  const value = useContext(VendorContext);
  if (!value) throw new Error("useVendor must be used inside VendorDesk.");
  return value;
}

const NAV = [
  { href: routes.vendor, label: "Overview", icon: LayoutDashboard, exact: true },
  { href: routes.vendorProducts, label: "Products", icon: Package },
  { href: routes.vendorOrders, label: "Orders", icon: ClipboardList },
  { href: routes.vendorCategories, label: "Categories", icon: FolderTree },
  { href: routes.vendorVariants, label: "Variants", icon: Layers },
  { href: routes.vendorDiscounts, label: "Discounts", icon: Percent },
  { href: routes.vendorCollections, label: "Collections", icon: Tags },
  { href: routes.vendorPayouts, label: "Payouts", icon: Wallet },
  { href: routes.vendorSettings, label: "Settings", icon: Settings },
] as const;

export function VendorDesk({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const now = useNow();
  const me = useQuery(api.vendors.me, { now });
  const registering = pathname === routes.vendorRegister;

  async function signOut() {
    await authClient.signOut();
    router.replace(routes.vendorSignIn);
    router.refresh();
  }

  if (me === undefined) {
    return (
      <VendorShell onSignOut={() => void signOut()} me={null} showNav={false}>
        <div className="h-64 animate-pulse bg-soft-cloud" />
      </VendorShell>
    );
  }

  if (!me) {
    if (registering) {
      return (
        <VendorShell onSignOut={() => void signOut()} me={null} showNav={false}>
          {children}
        </VendorShell>
      );
    }
    return (
      <VendorShell onSignOut={() => void signOut()} me={null} showNav={false}>
        <EmptyState
          icon={Store}
          title="Sell on WardrobeAI"
          description="Open a store, list your pieces, and they'll show up next to the garments people already own."
          action={<Button href={routes.vendorRegister}>Open a store</Button>}
        />
      </VendorShell>
    );
  }

  if (registering) {
    return (
      <VendorShell onSignOut={() => void signOut()} me={me} showNav={false}>
        <EmptyState
          icon={Store}
          title={`You already run ${me.vendor.name}`}
          action={<Button href={routes.vendor}>Go to your store</Button>}
        />
      </VendorShell>
    );
  }

  const flushPage =
    pathname.startsWith(routes.vendorCategories) ||
    pathname.startsWith(routes.vendorVariants) ||
    pathname.startsWith(routes.vendorDiscounts) ||
    pathname.startsWith(routes.vendorProducts);

  return (
    <VendorContext value={me}>
      <VendorShell onSignOut={() => void signOut()} me={me} showNav flush={flushPage}>
        <div className={cn("flex min-h-full flex-1 flex-col", flushPage ? "gap-0" : "gap-6")}>
          <StatusNotice me={me} />
          <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        </div>
      </VendorShell>
    </VendorContext>
  );
}

function VendorShell({
  children,
  me,
  showNav,
  onSignOut,
  flush = false,
}: {
  children: ReactNode;
  me: VendorMe | null;
  showNav: boolean;
  onSignOut: () => void;
  /** Edge-to-edge content (no main padding / max-width). */
  flush?: boolean;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  return (
    <div className="h-dvh overflow-hidden bg-canvas text-ink">
      <div className="flex h-full">
        {showNav ? (
          <aside className="hidden h-full w-64 shrink-0 flex-col border-r border-hairline bg-canvas lg:flex">
            <SidebarBrand storeName={me?.vendor.name ?? null} />
            <SidebarNav pathname={pathname} />
            <SidebarFooter onSignOut={onSignOut} />
          </aside>
        ) : null}

        <div className="flex h-full min-w-0 flex-1 flex-col">
          <header className="z-30 shrink-0 border-b border-hairline bg-canvas pt-[env(safe-area-inset-top)]">
            <div className="flex h-14 items-center gap-2 px-4 sm:gap-3 sm:px-8">
              {showNav ? (
                <button
                  type="button"
                  aria-label="Open menu"
                  aria-expanded={mobileOpen}
                  onClick={() => setMobileOpen(true)}
                  className="flex size-11 shrink-0 items-center justify-center rounded-full bg-soft-cloud lg:hidden"
                >
                  <Menu className="size-4" aria-hidden />
                </button>
              ) : null}
              <Link
                href={routes.vendor}
                className={cn(
                  "min-w-0 truncate font-display text-xl tracking-tight text-ink uppercase",
                  showNav && "lg:hidden",
                )}
              >
                WardrobeAI
              </Link>
              {me?.vendor.name ? (
                <span className="hidden min-w-0 truncate text-sm text-mute sm:inline lg:hidden">
                  {me.vendor.name}
                </span>
              ) : null}
              <div className="ml-auto flex items-center gap-2">
                {me ? <StatusPill status={me.vendor.status} className="hidden sm:inline-flex lg:hidden" /> : null}
                {!showNav ? (
                  <button
                    type="button"
                    onClick={onSignOut}
                    className="inline-flex h-10 items-center gap-2 rounded-full bg-soft-cloud px-4 text-sm font-medium text-ink transition active:scale-95 active:opacity-50"
                  >
                    <LogOut className="size-4 shrink-0" aria-hidden />
                    Sign out
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onSignOut}
                    className="inline-flex h-10 items-center gap-2 rounded-full bg-soft-cloud px-4 text-sm font-medium text-ink transition active:scale-95 active:opacity-50 lg:hidden"
                  >
                    <LogOut className="size-4 shrink-0" aria-hidden />
                    <span className="sr-only sm:not-sr-only">Sign out</span>
                  </button>
                )}
              </div>
            </div>
          </header>

          <main
            className={cn(
              "flex min-h-0 w-full flex-1 flex-col",
              flush
                ? "overflow-hidden p-0"
                : "mx-auto max-w-6xl overflow-y-auto px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-8 sm:py-10",
            )}
          >
            {children}
          </main>
        </div>
      </div>

      {showNav && mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-ink/25"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-[min(18rem,85vw)] flex-col bg-canvas pt-[env(safe-area-inset-top)] shadow-none">
            <div className="flex h-14 items-center justify-between border-b border-hairline px-4">
              <SidebarBrand storeName={me?.vendor.name ?? null} compact />
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setMobileOpen(false)}
                className="flex size-10 items-center justify-center rounded-full bg-soft-cloud"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
            <SidebarNav pathname={pathname} />
            <SidebarFooter onSignOut={onSignOut} />
          </aside>
        </div>
      ) : null}
    </div>
  );
}

function SidebarBrand({ storeName, compact }: { storeName: string | null; compact?: boolean }) {
  return (
    <div
      className={cn(
        "shrink-0 border-b border-hairline",
        compact ? "min-w-0 flex-1" : "flex h-14 flex-col justify-center px-5",
      )}
    >
      <Link
        href={routes.vendor}
        className="font-display text-xl tracking-tight text-ink uppercase"
      >
        WardrobeAI
      </Link>
      {!compact ? (
        <p className="truncate text-[10px] font-medium tracking-[0.16em] text-mute uppercase">
          {storeName ?? "Store desk"}
        </p>
      ) : storeName ? (
        <p className="truncate text-xs text-mute">{storeName}</p>
      ) : null}
    </div>
  );
}

function SidebarNav({ pathname }: { pathname: string }) {
  return (
    <nav aria-label="Store desk" className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
      {NAV.map((item) => {
        const active =
          "exact" in item && item.exact ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-11 items-center gap-3 rounded-full px-4 text-sm font-medium transition active:scale-95 active:opacity-50",
              active ? "bg-ink text-canvas" : "text-ink hover:bg-soft-cloud",
            )}
          >
            <item.icon className="size-4 shrink-0" aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarFooter({ onSignOut }: { onSignOut: () => void }) {
  return (
    <div className="flex flex-col gap-1 border-t border-hairline px-3 py-4">
      <button
        type="button"
        onClick={onSignOut}
        className="flex h-11 items-center gap-3 rounded-full px-4 text-sm font-medium text-ink transition hover:bg-soft-cloud active:scale-95 active:opacity-50"
      >
        <LogOut className="size-4 shrink-0" aria-hidden />
        Sign out
      </button>
    </div>
  );
}

function StatusPill({
  status,
  className,
}: {
  status: VendorMe["vendor"]["status"];
  className?: string;
}) {
  const label = { pending: "Awaiting approval", active: "Live", suspended: "Suspended", closed: "Closed" }[
    status
  ];
  return (
    <span
      className={cn(
        "inline-flex h-8 items-center rounded-full px-3 text-xs font-medium",
        status === "active" ? "bg-soft-cloud text-success" : "bg-soft-cloud text-mute",
        status === "suspended" && "text-sale",
        className,
      )}
    >
      {label}
    </span>
  );
}

function StatusNotice({ me }: { me: VendorMe }) {
  if (me.vendor.status === "pending") {
    return (
      <p className="border border-hairline bg-soft-cloud px-4 py-3 text-sm">
        Your store is waiting for the WardrobeAI team to approve it. You can add products now; they go live once
        the store is approved.
      </p>
    );
  }
  if (me.vendor.status === "suspended") {
    return (
      <p className="border border-sale/40 px-4 py-3 text-sm text-sale">
        This store is suspended. Products are hidden and edits are locked until the team reinstates it.
      </p>
    );
  }
  if (me.vendor.planStatus === "past_due") {
    return (
      <p className="border border-hairline bg-soft-cloud px-4 py-3 text-sm">
        Your platform fee is overdue. Settle it in{" "}
        <Link href={routes.vendorBilling} className="underline underline-offset-4">
          Billing
        </Link>{" "}
        to keep your products listed.
      </p>
    );
  }
  return null;
}
