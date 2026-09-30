"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { useQuery } from "convex/react";
import {
  ArrowLeft,
  Brush,
  ChevronRight,
  Droplets,
  Glasses,
  Images,
  LayoutGrid,
  LogOut,
  MessageCircle,
  Palette,
  Plus,
  Scissors,
  Settings,
  ShoppingBag,
  Sparkles,
  Shirt,
  Store,
} from "lucide-react";
import { api } from "@convex/_generated/api";
import { ActivityPopover } from "@/components/layout/ActivityPopover";
import { AccountMenu } from "@/components/layout/AccountMenu";
import {
  AppHeaderProvider,
  useAppHeaderTitle,
} from "@/components/layout/app-header";
import { OnboardingGate } from "@/components/layout/OnboardingGate";
import { StylistPanel } from "@/components/stylist/stylist-panel";
import { StylistProvider, useStylistPanel } from "@/components/stylist/stylist-provider";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/cn";
import { routes } from "@/lib/routes";

const WARDROBE_CHILDREN = [
  { href: routes.add, label: "Add clothes", icon: Plus },
  { href: routes.outfits, label: "Outfits", icon: LayoutGrid },
  { href: routes.lookbook, label: "Lookbook", icon: Images },
] as const;

const MAIN_SERVICES = [
  { href: routes.service("hair-color"), label: "Hair Color", icon: Palette, also: [] },
  { href: routes.service("hairstyle"), label: "Beard/Hair Style", icon: Scissors, also: [routes.service("beard")] },
  { href: routes.service("eyewear"), label: "Eyewear", icon: Glasses, also: [] },
  { href: routes.service("makeup"), label: "Makeup", icon: Brush, also: [] },
  { href: routes.service("skincare"), label: "SkinCare", icon: Droplets, also: [] },
] as const;

const SHOP_NAV = { href: routes.shop, label: "Shop", icon: Store } as const;

const PRIMARY_NAV = [
  { href: routes.wardrobe, label: "Wardrobe", icon: Shirt },
  ...WARDROBE_CHILDREN,
  SHOP_NAV,
  ...MAIN_SERVICES.map(({ href, label, icon }) => ({ href, label, icon })),
  { href: routes.stylist, label: "Stylist", icon: MessageCircle },
] as const;

function isWardrobeSection(pathname: string): boolean {
  return (
    isActivePath(pathname, routes.wardrobe) ||
    WARDROBE_CHILDREN.some((item) => isActivePath(pathname, item.href)) ||
    pathname.startsWith(routes.gridDemo)
  );
}

function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function isMainService(pathname: string): boolean {
  return MAIN_SERVICES.some(
    (item) => pathname === item.href || item.also.some((href) => pathname === href),
  );
}

function isRootTab(pathname: string): boolean {
  return isMainService(pathname) || PRIMARY_NAV.some((item) => pathname === item.href);
}

function parentHref(pathname: string): string {
  if (pathname.startsWith(`${routes.wardrobe}/`)) return routes.wardrobe;
  if (pathname.startsWith(`${routes.outfits}/`) || pathname === routes.newOutfit) {
    return routes.outfits;
  }
  if (pathname.startsWith(`${routes.stylist}/`)) return routes.stylist;
  if (pathname.startsWith(`${routes.services}/`)) return routes.services;
  if (pathname.startsWith(routes.gridDemo)) return routes.add;
  if (pathname.startsWith(routes.checkout)) return routes.cart;
  if (pathname.startsWith(`${routes.orders}/`)) return routes.orders;
  if (/^\/store\/[^/]+\/[^/]+/.test(pathname)) return routes.shop;
  if (pathname.startsWith("/store/")) return routes.shop;
  return routes.wardrobe;
}

function fallbackTitle(pathname: string): string {
  const tab = PRIMARY_NAV.find((item) => pathname === item.href);
  if (tab) return tab.label;
  if (pathname === routes.newOutfit) return "New outfit";
  if (pathname.startsWith(`${routes.wardrobe}/`)) return "Piece";
  if (pathname.startsWith(`${routes.outfits}/`)) return "Outfit";
  if (pathname.startsWith(`${routes.stylist}/`)) return "Chat";
  const service = MAIN_SERVICES.find(
    (item) => pathname === item.href || item.also.some((href) => pathname === href),
  );
  if (service) return service.label;
  if (pathname.startsWith(routes.services)) return "Services";
  if (pathname.startsWith(routes.settings)) return "Settings";
  if (pathname.startsWith(routes.billing)) return "Billing";
  if (/^\/store\/[^/]+\/[^/]+/.test(pathname)) return "Product";
  if (pathname.startsWith("/store/")) return "Store";
  if (pathname.startsWith(routes.orders)) return "Orders";
  if (pathname.startsWith(routes.checkoutComplete)) return "Order";
  if (pathname.startsWith(routes.checkout)) return "Checkout";
  if (pathname.startsWith(routes.cart)) return "Bag";
  if (pathname.startsWith(routes.gridDemo)) return "Grid demo";
  return "WardrobeAI";
}

function isChatRoute(pathname: string): boolean {
  return /^\/stylist\/[^/]+/.test(pathname);
}

function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const onResize = () => {
      setOpen(viewport.height < window.innerHeight * 0.75);
    };
    viewport.addEventListener("resize", onResize);
    return () => viewport.removeEventListener("resize", onResize);
  }, []);
  return open;
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <OnboardingGate>
      <StylistProvider>
        <AppHeaderProvider>
          <AppFrame>{children}</AppFrame>
        </AppHeaderProvider>
        <StylistPanel />
      </StylistProvider>
    </OnboardingGate>
  );
}

function AppFrame({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const me = useQuery(api.users.me);
  const cartCount = useQuery(api.cart.count, me ? {} : "skip");
  const onboarded = Boolean(me?.onboardedAt);
  const panel = useStylistPanel();
  const headerTitle = useAppHeaderTitle();
  const keyboardOpen = useKeyboardOpen();
  const showChrome = onboarded && !pathname.startsWith(routes.onboarding);
  const showTabs = showChrome && !keyboardOpen;
  const detail = onboarded && !isRootTab(pathname);
  const chatImmersive = isChatRoute(pathname);

  async function signOut() {
    await authClient.signOut();
    router.replace(routes.signIn);
    router.refresh();
  }

  return (
    <div
      className={cn(
        "min-h-dvh bg-canvas text-ink",
        chatImmersive && "lg:min-h-dvh max-lg:h-dvh max-lg:overflow-hidden",
      )}
    >
      <div
        className={cn(
          "flex min-h-dvh",
          chatImmersive && "max-lg:h-dvh max-lg:min-h-0",
        )}
      >
      {showChrome ? (
        <Sidebar
          pathname={pathname}
          onSignOut={() => void signOut()}
        />
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 shrink-0 border-b border-hairline bg-canvas pt-[env(safe-area-inset-top)]">
          <div className="flex h-14 min-w-0 items-center gap-2 px-4 sm:gap-3 sm:px-8">
            {detail ? (
              <Link
                href={parentHref(pathname)}
                aria-label="Back"
                className="flex size-11 shrink-0 items-center justify-center rounded-full bg-soft-cloud lg:hidden"
              >
                <ArrowLeft className="size-4" aria-hidden />
              </Link>
            ) : null}
            {detail ? (
              <p className="min-w-0 flex-1 truncate text-sm font-medium lg:hidden">
                {headerTitle ?? fallbackTitle(pathname)}
              </p>
            ) : (
              <Link
                href={routes.wardrobe}
                className={cn(
                  "min-w-0 truncate font-display text-xl font-medium uppercase tracking-tight",
                  showChrome && "lg:hidden",
                )}
              >
                WardrobeAI
              </Link>
            )}
            {showChrome ? (
              <p className="hidden min-w-0 truncate text-sm font-medium lg:block">
                {headerTitle ?? fallbackTitle(pathname)}
              </p>
            ) : null}

            <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
              {me === undefined ? (
                <span className="text-sm text-mute">Loading…</span>
              ) : me ? (
                <>
                  {onboarded ? (
                    <div className="hidden xl:block">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="h-10"
                        onClick={() => panel.setOpen(true)}
                      >
                        <Sparkles className="size-3.5" aria-hidden />
                        Ask stylist
                      </Button>
                    </div>
                  ) : null}
                  <Link
                    href={routes.billing}
                    className={cn(
                      "hidden rounded-full px-3 py-1 text-sm font-medium transition-colors lg:inline",
                      me.balance.lowBalance ? "bg-soft-cloud text-sale" : "bg-soft-cloud text-ink",
                      isActivePath(pathname, routes.billing) && "ring-1 ring-ink",
                    )}
                  >
                    {me.balance.total} credits
                  </Link>
                  {onboarded ? (
                    <Link
                      href={routes.cart}
                      aria-label={cartCount ? `Bag, ${cartCount} items` : "Bag"}
                      className="relative flex size-10 items-center justify-center rounded-full bg-soft-cloud"
                    >
                      <ShoppingBag className="size-4" aria-hidden />
                      {cartCount ? (
                        <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-ink px-1 text-[9px] font-medium text-canvas">
                          {cartCount}
                        </span>
                      ) : null}
                    </Link>
                  ) : null}
                  {onboarded ? <ActivityPopover /> : null}
                  {showChrome ? null : (
                    <button
                      type="button"
                      onClick={signOut}
                      className="hidden h-10 rounded-full bg-soft-cloud px-4 text-sm font-medium text-ink transition active:scale-95 active:opacity-50 lg:inline"
                    >
                      Sign out
                    </button>
                  )}
                  <AccountMenu />
                </>
              ) : (
                <Link
                  href={routes.signIn}
                  className="h-10 rounded-full bg-ink px-4 text-sm font-medium leading-10 text-canvas"
                >
                  Sign in
                </Link>
              )}
            </div>
          </div>
        </header>
        <main
          className={cn(
            "flex w-full flex-1 flex-col px-4 sm:px-8 lg:py-12",
            !onboarded && "py-6",
            onboarded && !chatImmersive && !keyboardOpen && "max-lg:pt-5 max-lg:pb-[calc(var(--app-tab-height)+1.25rem)]",
            onboarded && !chatImmersive && keyboardOpen && "max-lg:pt-5 max-lg:pb-4",
            chatImmersive && "max-lg:min-h-0 max-lg:overflow-hidden max-lg:pt-3 max-lg:pb-3",
          )}
        >
          {children}
        </main>
      </div>
      </div>
      {showTabs ? <BottomNav pathname={pathname} /> : null}
    </div>
  );
}

function Sidebar({
  pathname,
  onSignOut,
}: {
  pathname: string;
  onSignOut: () => void;
}) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-hairline bg-canvas lg:flex">
      <Link
        href={routes.wardrobe}
        className="flex h-14 shrink-0 items-center border-b border-hairline px-5 font-display text-xl font-medium uppercase tracking-tight"
      >
        WardrobeAI
      </Link>
      <nav aria-label="Main navigation" className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
        <WardrobeMenu pathname={pathname} />
        <SidebarLink
          href={SHOP_NAV.href}
          label={SHOP_NAV.label}
          icon={SHOP_NAV.icon}
          active={isActivePath(pathname, SHOP_NAV.href) || pathname.startsWith("/store/")}
        />
        {MAIN_SERVICES.map((item) => (
          <SidebarLink
            key={item.href}
            href={item.href}
            label={item.label}
            icon={item.icon}
            active={
              isActivePath(pathname, item.href) ||
              item.also.some((href) => isActivePath(pathname, href))
            }
          />
        ))}
        <SidebarLink
          href={routes.stylist}
          label="Stylist"
          icon={MessageCircle}
          active={isActivePath(pathname, routes.stylist)}
        />
      </nav>
      <div className="flex flex-col gap-1 border-t border-hairline px-3 py-4">
        <SidebarLink
          href={routes.settings}
          label="Settings"
          icon={Settings}
          active={isActivePath(pathname, routes.settings)}
        />
        <button
          type="button"
          onClick={onSignOut}
          className="flex h-11 items-center gap-3 rounded-full px-4 text-sm font-medium text-ink transition hover:bg-soft-cloud active:scale-95 active:opacity-50"
        >
          <LogOut className="size-4 shrink-0" aria-hidden />
          Sign out
        </button>
      </div>
    </aside>
  );
}

function WardrobeMenu({ pathname }: { pathname: string }) {
  const inSection = isWardrobeSection(pathname);
  const [open, setOpen] = useState(inSection);

  useEffect(() => {
    if (inSection) setOpen(true);
  }, [inSection]);

  return (
    <NavGroup
      label="Wardrobe"
      href={routes.wardrobe}
      icon={Shirt}
      active={isActivePath(pathname, routes.wardrobe)}
      open={open}
      onToggle={() => setOpen((value) => !value)}
    >
      {WARDROBE_CHILDREN.map((item) => (
        <SidebarLink
          key={item.href}
          href={item.href}
          label={item.label}
          icon={item.icon}
          active={isActivePath(pathname, item.href)}
        />
      ))}
    </NavGroup>
  );
}

function NavGroup({
  label,
  href,
  icon: Icon,
  active,
  open,
  onToggle,
  children,
}: {
  label: string;
  href: string;
  icon: typeof Shirt;
  active: boolean;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div>
      <div
        className={cn(
          "flex h-11 items-center rounded-full pr-1",
          active ? "bg-ink text-canvas" : "text-ink",
        )}
      >
        <Link
          href={href}
          aria-current={active ? "page" : undefined}
          className="flex h-full min-w-0 flex-1 items-center gap-3 rounded-full px-4 text-sm font-medium"
        >
          <Icon className="size-4 shrink-0" aria-hidden />
          {label}
        </Link>
        <button
          type="button"
          aria-expanded={open}
          aria-label={open ? `Collapse ${label}` : `Expand ${label}`}
          onClick={onToggle}
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full transition active:scale-95 active:opacity-50",
            active ? "hover:bg-canvas/15" : "hover:bg-soft-cloud",
          )}
        >
          <ChevronRight
            className={cn("size-4 transition-transform", open && "rotate-90")}
            aria-hidden
          />
        </button>
      </div>
      {open ? (
        <div className="mt-1 ml-6 flex flex-col gap-1 border-l border-hairline pl-2">
          {children}
        </div>
      ) : null}
    </div>
  );
}

function SidebarLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: typeof Shirt;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-11 items-center gap-3 rounded-full px-4 text-sm font-medium transition active:scale-95 active:opacity-50",
        active ? "bg-ink text-canvas" : "text-ink hover:bg-soft-cloud",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      {label}
    </Link>
  );
}

function tabLabel(label: string): string {
  switch (label) {
    case "Add clothes":
      return "Add";
    case "Lookbook":
      return "Looks";
    case "Hair Color":
      return "Color";
    case "Beard/Hair Style":
      return "Hair";
    case "SkinCare":
      return "Skin";
    default:
      return label;
  }
}

function BottomNav({ pathname }: { pathname: string }) {
  return (
    <nav
      aria-label="Mobile navigation"
      className="fixed inset-x-0 bottom-0 z-30 w-full overflow-hidden border-t border-hairline bg-canvas pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <div className="flex h-12 w-full overflow-x-auto overscroll-x-contain">
        {PRIMARY_NAV.map((item) => {
          const service = MAIN_SERVICES.find((entry) => entry.href === item.href);
          const active =
            isActivePath(pathname, item.href) ||
            Boolean(service?.also.some((href) => isActivePath(pathname, href))) ||
            (item.href === routes.shop && pathname.startsWith("/store/"));
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex w-14 shrink-0 flex-col items-center justify-center gap-0.5 px-1 text-[10px] font-medium min-[420px]:w-auto min-[420px]:min-w-0 min-[420px]:flex-1",
                active ? "text-ink" : "text-mute",
              )}
            >
              <item.icon className="size-4 shrink-0" aria-hidden />
              <span className="w-full truncate text-center">{tabLabel(item.label)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
