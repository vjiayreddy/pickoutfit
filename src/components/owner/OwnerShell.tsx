"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LayoutDashboard, LogOut, Package, ShoppingBag } from "lucide-react";
import { cn } from "@/lib/cn";

const LINKS = [
  { href: "/owner", label: "Sales", icon: LayoutDashboard },
  { href: "/owner/products", label: "Products", icon: Package },
  { href: "/owner/orders", label: "Orders", icon: ShoppingBag },
] as const;

export function OwnerShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="flex min-h-dvh bg-canvas text-ink">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-hairline bg-canvas lg:flex">
        <Link
          href="/owner"
          className="flex h-14 shrink-0 items-center border-b border-hairline px-5 font-display text-xl font-medium uppercase tracking-tight"
        >
          Owner
        </Link>
        <nav aria-label="Owner" className="flex flex-1 flex-col gap-1 px-3 py-4">
          {LINKS.map((link) => (
            <OwnerNavLink key={link.href} {...link} pathname={pathname} />
          ))}
        </nav>
        <div className="border-t border-hairline px-3 py-4">
          <OwnerSignOut />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-hairline bg-canvas lg:hidden">
          <div className="flex h-14 items-center justify-between px-4">
            <p className="font-display text-xl uppercase tracking-tight">Owner</p>
            <OwnerSignOut compact />
          </div>
          <nav aria-label="Owner" className="flex gap-2 overflow-x-auto px-4 pb-3">
            {LINKS.map((link) => (
              <OwnerNavLink key={link.href} {...link} pathname={pathname} compact />
            ))}
          </nav>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-8">{children}</main>
      </div>
    </div>
  );
}

function OwnerNavLink({
  href,
  label,
  icon: Icon,
  pathname,
  compact,
}: {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  pathname: string;
  compact?: boolean;
}) {
  const active = href === "/owner" ? pathname === href : pathname.startsWith(href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-11 shrink-0 items-center gap-3 rounded-full px-4 text-sm font-medium transition active:scale-95 active:opacity-50",
        compact && "h-10",
        active ? "bg-ink text-canvas" : "text-ink hover:bg-soft-cloud",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      {label}
    </Link>
  );
}

function OwnerSignOut({ compact }: { compact?: boolean }) {
  const [pending, setPending] = useState(false);
  async function signOut() {
    setPending(true);
    await fetch("/api/owner/session", { method: "DELETE" });
    window.location.href = "/owner/sign-in";
  }
  return (
    <button
      type="button"
      onClick={() => void signOut()}
      disabled={pending}
      className={cn(
        "flex h-11 items-center gap-3 rounded-full px-4 text-sm font-medium text-ink transition hover:bg-soft-cloud active:scale-95 active:opacity-50 disabled:opacity-50",
        compact && "h-10 bg-soft-cloud",
      )}
    >
      <LogOut className="size-4 shrink-0" aria-hidden />
      Sign out
    </button>
  );
}
