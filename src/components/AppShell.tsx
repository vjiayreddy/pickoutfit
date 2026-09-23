"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { useQuery } from "convex/react";
import {
  ArrowLeft,
  Images,
  LayoutGrid,
  MessageCircle,
  Plus,
  Settings,
  Shield,
  Shirt,
  Sparkles,
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

const PRIMARY_NAV = [
  { href: routes.wardrobe, label: "Wardrobe", icon: Shirt },
  { href: routes.add, label: "Add clothes", icon: Plus },
  { href: routes.outfits, label: "Outfits", icon: LayoutGrid },
  { href: routes.lookbook, label: "Lookbook", icon: Images },
  { href: routes.stylist, label: "Stylist", icon: MessageCircle },
] as const;

function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function isRootTab(pathname: string): boolean {
  return PRIMARY_NAV.some((item) => pathname === item.href);
}

function parentHref(pathname: string): string {
  if (pathname.startsWith(`${routes.wardrobe}/`)) return routes.wardrobe;
  if (pathname.startsWith(`${routes.outfits}/`) || pathname === routes.newOutfit) {
    return routes.outfits;
  }
  if (pathname.startsWith(`${routes.stylist}/`)) return routes.stylist;
  return routes.wardrobe;
}

function fallbackTitle(pathname: string): string {
  if (pathname === routes.newOutfit) return "New outfit";
  if (pathname.startsWith(`${routes.wardrobe}/`)) return "Piece";
  if (pathname.startsWith(`${routes.outfits}/`)) return "Outfit";
  if (pathname.startsWith(`${routes.stylist}/`)) return "Chat";
  if (pathname.startsWith(routes.settings)) return "Settings";
  if (pathname.startsWith(routes.billing)) return "Billing";
  if (pathname.startsWith(routes.admin)) return "Admin";
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
  const onboarded = Boolean(me?.onboardedAt);
  const panel = useStylistPanel();
  const headerTitle = useAppHeaderTitle();
  const keyboardOpen = useKeyboardOpen();
  const showTabs = onboarded && !pathname.startsWith(routes.onboarding) && !keyboardOpen;
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
        "flex min-h-dvh flex-col bg-canvas text-ink",
        chatImmersive && "lg:min-h-dvh max-lg:h-dvh max-lg:overflow-hidden",
      )}
    >
      <header className="sticky top-0 z-30 shrink-0 border-b border-hairline bg-canvas pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-3 px-4 sm:px-8">
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
              className="font-display text-xl font-medium uppercase tracking-tight"
            >
              WardrobeAI
            </Link>
          )}
          {detail ? (
            <Link
              href={routes.wardrobe}
              className="hidden font-display text-xl font-medium uppercase tracking-tight lg:inline"
            >
              WardrobeAI
            </Link>
          ) : null}

          {onboarded ? (
            <nav
              aria-label="Main navigation"
              className="ml-6 hidden h-full items-center gap-6 lg:flex"
            >
              {PRIMARY_NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActivePath(pathname, item.href) ? "page" : undefined}
                  className={cn(
                    "relative flex h-full items-center text-sm font-medium transition-colors",
                    isActivePath(pathname, item.href)
                      ? "text-ink after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-ink"
                      : "text-mute hover:text-ink",
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          ) : null}

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            {me === undefined ? (
              <span className="text-sm text-mute">Loading…</span>
            ) : me ? (
              <>
                {onboarded ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="hidden h-10 xl:inline-flex"
                    onClick={() => panel.setOpen(true)}
                  >
                    <Sparkles className="size-3.5" aria-hidden />
                    Ask stylist
                  </Button>
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
                {onboarded ? <ActivityPopover /> : null}
                {me.role === "admin" ? (
                  <Link
                    href={routes.admin}
                    aria-current={isActivePath(pathname, routes.admin) ? "page" : undefined}
                    className={cn(
                      "hidden h-10 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition lg:inline-flex",
                      isActivePath(pathname, routes.admin)
                        ? "bg-ink text-canvas"
                        : "bg-soft-cloud text-ink",
                    )}
                  >
                    <Shield className="size-3.5" aria-hidden />
                    Admin
                  </Link>
                ) : null}
                <Link
                  href={routes.settings}
                  aria-label="Settings"
                  aria-current={isActivePath(pathname, routes.settings) ? "page" : undefined}
                  className={cn(
                    "hidden size-10 items-center justify-center rounded-full transition lg:flex",
                    isActivePath(pathname, routes.settings)
                      ? "bg-ink text-canvas"
                      : "bg-soft-cloud text-ink",
                  )}
                >
                  <Settings className="size-4" aria-hidden />
                </Link>
                <button
                  type="button"
                  onClick={signOut}
                  className="hidden h-10 rounded-full bg-soft-cloud px-4 text-sm font-medium text-ink transition active:scale-95 active:opacity-50 lg:inline"
                >
                  Sign out
                </button>
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
          "mx-auto flex w-full max-w-[1440px] flex-1 flex-col px-4 sm:px-8 lg:py-12",
          !onboarded && "py-6",
          onboarded && !chatImmersive && !keyboardOpen && "max-lg:pt-5 max-lg:pb-[calc(var(--app-tab-height)+1.25rem)]",
          onboarded && !chatImmersive && keyboardOpen && "max-lg:pt-5 max-lg:pb-4",
          chatImmersive && "max-lg:min-h-0 max-lg:overflow-hidden max-lg:pt-3 max-lg:pb-3",
        )}
      >
        {children}
      </main>
      {showTabs ? <BottomNav pathname={pathname} /> : null}
    </div>
  );
}

function BottomNav({ pathname }: { pathname: string }) {
  return (
    <nav
      aria-label="Mobile navigation"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-hairline bg-canvas pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <div className="mx-auto flex h-12 max-w-[1440px]">
        {PRIMARY_NAV.map((item) => {
          const active = isActivePath(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium",
                active ? "text-ink" : "text-mute",
              )}
            >
              <item.icon className="size-4" aria-hidden />
              <span className="truncate">{item.label === "Add clothes" ? "Add" : item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
