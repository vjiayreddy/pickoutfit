"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode } from "react";
import { useQuery } from "convex/react";
import {
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

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <OnboardingGate>
      <StylistProvider>
        <AppFrame>{children}</AppFrame>
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

  async function signOut() {
    await authClient.signOut();
    router.replace(routes.signIn);
    router.refresh();
  }

  return (
    <div className="flex min-h-full flex-col bg-canvas text-ink">
      <header className="sticky top-0 z-30 border-b border-hairline bg-canvas">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-3 px-4 sm:px-8">
          <Link
            href={routes.wardrobe}
            className="font-display text-xl font-medium uppercase tracking-tight"
          >
            WardrobeAI
          </Link>

          {onboarded ? (
            <nav
              aria-label="Main navigation"
              className="ml-6 hidden h-full items-center gap-6 lg:flex"
            >
              {PRIMARY_NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={
                    isActivePath(pathname, item.href) ? "page" : undefined
                  }
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
                    className="hidden h-10 sm:inline-flex"
                    onClick={() => panel.setOpen(true)}
                  >
                    <Sparkles className="size-3.5" aria-hidden />
                    Ask stylist
                  </Button>
                ) : null}
                <Link
                  href={routes.billing}
                  className={cn(
                    "rounded-full px-3 py-1 text-sm font-medium transition-colors",
                    me.balance.lowBalance
                      ? "bg-soft-cloud text-sale"
                      : "bg-soft-cloud text-ink",
                    isActivePath(pathname, routes.billing) && "ring-1 ring-ink",
                  )}
                >
                  {me.balance.total} credits
                </Link>
                {onboarded ? <ActivityPopover /> : null}
                {me.role === "admin" ? (
                  <Link
                    href={routes.admin}
                    aria-current={
                      isActivePath(pathname, routes.admin) ? "page" : undefined
                    }
                    className={cn(
                      "hidden h-10 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition sm:inline-flex",
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
                  aria-current={
                    isActivePath(pathname, routes.settings) ? "page" : undefined
                  }
                  className={cn(
                    "flex size-10 items-center justify-center rounded-full transition",
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
                  className="h-10 rounded-full bg-soft-cloud px-4 text-sm font-medium text-ink transition active:scale-95 active:opacity-50"
                >
                  Sign out
                </button>
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

        {onboarded ? (
          <nav
            aria-label="Mobile navigation"
            className="flex overflow-x-auto border-t border-hairline px-2 lg:hidden"
          >
            {PRIMARY_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={
                  isActivePath(pathname, item.href) ? "page" : undefined
                }
                className={cn(
                  "relative flex min-h-11 flex-1 items-center justify-center gap-1.5 border-b-2 px-2 text-xs font-medium",
                  isActivePath(pathname, item.href)
                    ? "border-ink text-ink"
                    : "border-transparent text-mute",
                )}
              >
                <item.icon className="size-3.5" aria-hidden />
                {item.label}
              </Link>
            ))}
          </nav>
        ) : null}
      </header>
      <main className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col px-4 py-8 sm:px-8 sm:py-12">
        {children}
      </main>
    </div>
  );
}
