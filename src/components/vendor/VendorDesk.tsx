"use client";

import { useQuery } from "convex/react";
import {
  ClipboardList,
  FolderTree,
  GitBranch,
  Layers,
  LayoutDashboard,
  ListTree,
  LogOut,
  Package,
  Percent,
  Settings,
  ShoppingBag,
  Store,
  Tag,
  Tags,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, type ReactNode } from "react";
import { api } from "@convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { EmptyState } from "@/components/common/EmptyState";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
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

const NAV_GROUPS = [
  {
    label: "Desk",
    items: [
      { href: routes.vendor, label: "Overview", icon: LayoutDashboard, exact: true },
      { href: routes.vendorProducts, label: "Products", icon: Package },
      { href: routes.vendorOrders, label: "Orders", icon: ClipboardList },
      { href: routes.vendorCarts, label: "Carts", icon: ShoppingBag },
    ],
  },
  {
    label: "Catalog",
    items: [
      { href: routes.vendorCategories, label: "Categories", icon: FolderTree },
      { href: routes.vendorBrands, label: "Brands", icon: Tag },
      { href: routes.vendorAttributes, label: "Attributes", icon: ListTree },
      { href: routes.vendorVariantCategories, label: "Variant recipes", icon: GitBranch },
      { href: routes.vendorVariants, label: "Variants", icon: Layers },
      { href: routes.vendorCollections, label: "Collections", icon: Tags },
      { href: routes.vendorDiscounts, label: "Discounts", icon: Percent },
    ],
  },
  {
    label: "Account",
    items: [
      { href: routes.vendorPayouts, label: "Payouts", icon: Wallet },
      { href: routes.vendorSettings, label: "Settings", icon: Settings },
    ],
  },
] as const;

function isNavActive(pathname: string, href: string, exact?: boolean) {
  return exact ? pathname === href : pathname.startsWith(href);
}

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
      <VendorBareShell onSignOut={() => void signOut()}>
        <div className="space-y-4 p-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-40 w-full" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        </div>
      </VendorBareShell>
    );
  }

  if (!me) {
    if (registering) {
      return (
        <VendorBareShell onSignOut={() => void signOut()}>{children}</VendorBareShell>
      );
    }
    return (
      <VendorBareShell onSignOut={() => void signOut()}>
        <EmptyState
          icon={Store}
          title="Sell on WardrobeAI"
          description="Open a store, list your pieces, and they'll show up next to the garments people already own."
          action={<Button href={routes.vendorRegister}>Open a store</Button>}
        />
      </VendorBareShell>
    );
  }

  if (registering) {
    return (
      <VendorBareShell onSignOut={() => void signOut()} storeName={me.vendor.name}>
        <EmptyState
          icon={Store}
          title={`You already run ${me.vendor.name}`}
          action={<Button href={routes.vendor}>Go to your store</Button>}
        />
      </VendorBareShell>
    );
  }

  const flushPage =
    pathname.startsWith(routes.vendorCategories) ||
    pathname.startsWith(routes.vendorBrands) ||
    pathname.startsWith(routes.vendorAttributes) ||
    pathname.startsWith(routes.vendorVariantCategories) ||
    pathname.startsWith(routes.vendorVariants) ||
    pathname.startsWith(routes.vendorDiscounts) ||
    pathname.startsWith(routes.vendorProducts);

  return (
    <VendorContext value={me}>
      <SidebarProvider className="h-dvh! min-h-0!">
        <VendorAppSidebar storeName={me.vendor.name} onSignOut={() => void signOut()} />
        <SidebarInset className="min-h-0 overflow-hidden">
          <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background px-3 sm:px-4">
            <SidebarTrigger className="-ml-1" />
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Link
                href={routes.vendor}
                className="truncate font-display text-lg tracking-tight text-foreground uppercase md:hidden"
              >
                WardrobeAI
              </Link>
              <span className="hidden truncate text-sm font-medium text-foreground sm:inline">
                {me.vendor.name}
              </span>
              <StatusBadge status={me.vendor.status} className="hidden sm:inline-flex" />
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="md:hidden"
              onClick={() => void signOut()}
            >
              <LogOut />
              <span className="sr-only sm:not-sr-only">Sign out</span>
            </Button>
          </header>

          <div
            className={cn(
              "flex min-h-0 flex-1 flex-col",
              flushPage
                ? "overflow-hidden"
                : "overflow-y-auto px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-8",
            )}
          >
            <div
              className={cn(
                "flex min-h-full flex-1 flex-col",
                flushPage ? "gap-0" : "mx-auto w-full max-w-6xl gap-6",
              )}
            >
              <StatusNotice me={me} />
              <div className="flex min-h-0 flex-1 flex-col">{children}</div>
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </VendorContext>
  );
}

function VendorAppSidebar({
  storeName,
  onSignOut,
}: {
  storeName: string;
  onSignOut: () => void;
}) {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader className="h-14 justify-center gap-0 border-b border-sidebar-border p-0 px-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              render={<Link href={routes.vendor} />}
              className="h-12 rounded-none data-active:bg-transparent"
              tooltip="WardrobeAI"
            >
              <div className="flex size-8 shrink-0 items-center justify-center bg-sidebar-primary text-sidebar-primary-foreground">
                <Store className="size-4" aria-hidden />
              </div>
              <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
                <span className="truncate font-display text-base tracking-tight uppercase">
                  WardrobeAI
                </span>
                <span className="truncate text-xs text-muted-foreground">{storeName}</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {NAV_GROUPS.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const active = isNavActive(
                    pathname,
                    item.href,
                    "exact" in item ? item.exact : false,
                  );
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        render={<Link href={item.href} />}
                        isActive={active}
                        tooltip={item.label}
                        className={cn(
                          "rounded-full",
                          "data-active:bg-sidebar-primary data-active:text-sidebar-primary-foreground",
                          "data-active:hover:bg-sidebar-primary data-active:hover:text-sidebar-primary-foreground",
                        )}
                      >
                        <item.icon />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              type="button"
              onClick={onSignOut}
              tooltip="Sign out"
              className="rounded-full"
            >
              <LogOut />
              <span>Sign out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

/** Minimal chrome for auth / onboarding states (no desk nav). */
function VendorBareShell({
  children,
  onSignOut,
  storeName,
}: {
  children: ReactNode;
  onSignOut: () => void;
  storeName?: string;
}) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4 pt-[env(safe-area-inset-top)] sm:px-6">
        <Link
          href={routes.vendor}
          className="font-display text-xl tracking-tight text-foreground uppercase"
        >
          WardrobeAI
        </Link>
        {storeName ? (
          <span className="truncate text-sm text-muted-foreground">{storeName}</span>
        ) : (
          <span className="text-[10px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
            Store desk
          </span>
        )}
        <Button type="button" variant="secondary" size="sm" className="ml-auto" onClick={onSignOut}>
          <LogOut />
          Sign out
        </Button>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 overflow-y-auto px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-8 sm:py-10">
        {children}
      </main>
    </div>
  );
}

function StatusBadge({
  status,
  className,
}: {
  status: VendorMe["vendor"]["status"];
  className?: string;
}) {
  const label = {
    pending: "Awaiting approval",
    active: "Live",
    suspended: "Suspended",
    closed: "Closed",
  }[status];

  const variant =
    status === "active" ? "secondary" : status === "suspended" ? "destructive" : "outline";

  return (
    <Badge variant={variant} className={cn(status === "active" && "text-success", className)}>
      {label}
    </Badge>
  );
}

function StatusNotice({ me }: { me: VendorMe }) {
  if (me.vendor.status === "pending") {
    return (
      <Alert className="rounded-none">
        <AlertTitle>Awaiting approval</AlertTitle>
        <AlertDescription>
          Your store is waiting for the WardrobeAI team to approve it. You can add products now; they
          go live once the store is approved.
        </AlertDescription>
      </Alert>
    );
  }
  if (me.vendor.status === "suspended") {
    return (
      <Alert variant="destructive" className="rounded-none">
        <AlertTitle>Store suspended</AlertTitle>
        <AlertDescription>
          Products are hidden and edits are locked until the team reinstates it.
        </AlertDescription>
      </Alert>
    );
  }
  if (me.vendor.planStatus === "past_due") {
    return (
      <Alert className="rounded-none">
        <AlertTitle>Platform fee overdue</AlertTitle>
        <AlertDescription>
          Settle it in{" "}
          <Link href={routes.vendorBilling} className="font-medium underline underline-offset-4">
            Billing
          </Link>{" "}
          to keep your products listed.
        </AlertDescription>
      </Alert>
    );
  }
  return null;
}
