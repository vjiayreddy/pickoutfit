"use client";

import {
  LayoutDashboard,
  LogOut,
  Menu,
  Store,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/cn";
import { routes } from "@/lib/routes";

const NAV = [
  { href: routes.admin, label: "Overview", icon: LayoutDashboard, exact: true },
  { href: routes.adminVendors, label: "Vendors", icon: Store },
] as const;

export function PlatformShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
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

  async function signOut() {
    await authClient.signOut();
    router.replace(routes.adminSignIn);
    router.refresh();
  }

  return (
    <div className="min-h-dvh bg-canvas text-ink">
      <div className="flex min-h-dvh">
        <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-hairline bg-canvas lg:flex">
          <SidebarBrand />
          <SidebarNav pathname={pathname} />
          <SidebarFooter onSignOut={() => void signOut()} />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 border-b border-hairline bg-canvas pt-[env(safe-area-inset-top)]">
            <div className="flex h-14 items-center gap-2 px-4 sm:gap-3 sm:px-8">
              <button
                type="button"
                aria-label="Open menu"
                aria-expanded={mobileOpen}
                onClick={() => setMobileOpen(true)}
                className="flex size-11 shrink-0 items-center justify-center rounded-full bg-soft-cloud lg:hidden"
              >
                <Menu className="size-4" aria-hidden />
              </button>
              <Link
                href={routes.admin}
                className="min-w-0 truncate font-display text-xl tracking-tight text-ink uppercase lg:hidden"
              >
                WardrobeAI
              </Link>
              <span className="hidden text-xs font-medium tracking-[0.14em] text-mute uppercase sm:inline lg:hidden">
                Platform
              </span>
              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void signOut()}
                  className="inline-flex h-10 items-center gap-2 rounded-full bg-soft-cloud px-4 text-sm font-medium text-ink transition active:scale-95 active:opacity-50 lg:hidden"
                >
                  <LogOut className="size-4 shrink-0" aria-hidden />
                  <span className="sr-only sm:not-sr-only">Sign out</span>
                </button>
              </div>
            </div>
          </header>

          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-8 sm:py-10">
            {children}
          </main>
        </div>
      </div>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-ink/25"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-[min(18rem,85vw)] flex-col bg-canvas pt-[env(safe-area-inset-top)]">
            <div className="flex h-14 items-center justify-between border-b border-hairline px-4">
              <SidebarBrand compact />
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
            <SidebarFooter onSignOut={() => void signOut()} />
          </aside>
        </div>
      ) : null}
    </div>
  );
}

function SidebarBrand({ compact }: { compact?: boolean }) {
  return (
    <div
      className={cn(
        "shrink-0 border-b border-hairline",
        compact ? "min-w-0 flex-1" : "flex h-14 flex-col justify-center px-5",
      )}
    >
      <Link href={routes.admin} className="font-display text-xl tracking-tight text-ink uppercase">
        WardrobeAI
      </Link>
      {!compact ? (
        <p className="text-[10px] font-medium tracking-[0.16em] text-mute uppercase">Platform</p>
      ) : (
        <p className="truncate text-xs text-mute">Platform</p>
      )}
    </div>
  );
}

function SidebarNav({ pathname }: { pathname: string }) {
  return (
    <nav aria-label="Platform" className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
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
