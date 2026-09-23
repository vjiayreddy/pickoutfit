"use client";

import { useQuery } from "convex/react";
import { Menu, Shield } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/cn";
import { routes } from "@/lib/routes";

function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AccountMenu() {
  const router = useRouter();
  const pathname = usePathname();
  const me = useQuery(api.users.me);
  const [open, setOpen] = useState(false);

  async function signOut() {
    setOpen(false);
    await authClient.signOut();
    router.replace(routes.signIn);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        aria-label="Account menu"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="relative flex size-11 items-center justify-center rounded-full bg-soft-cloud text-ink lg:hidden"
      >
        <Menu className="size-4" aria-hidden />
        {me?.balance.lowBalance ? (
          <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-sale" />
        ) : null}
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-ink/25"
            aria-label="Close account menu"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 bg-canvas pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
              <p className="text-sm font-medium">Account</p>
              <button
                type="button"
                className="h-11 px-2 text-sm font-medium text-mute"
                onClick={() => setOpen(false)}
              >
                Close
              </button>
            </div>
            <nav className="flex flex-col py-2" aria-label="Account">
              <Link
                href={routes.billing}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex h-12 items-center justify-between px-4 text-sm font-medium",
                  me?.balance.lowBalance ? "text-sale" : "text-ink",
                )}
              >
                <span>Credits</span>
                <span className="tabular-nums">{me?.balance.total ?? "—"}</span>
              </Link>
              <MenuLink
                href={routes.billing}
                label="Billing"
                active={isActivePath(pathname, routes.billing)}
                onNavigate={() => setOpen(false)}
              />
              <MenuLink
                href={routes.settings}
                label="Settings"
                active={isActivePath(pathname, routes.settings)}
                onNavigate={() => setOpen(false)}
              />
              {me?.role === "admin" ? (
                <Link
                  href={routes.admin}
                  onClick={() => setOpen(false)}
                  className="flex h-12 items-center gap-2 px-4 text-sm font-medium"
                >
                  <Shield className="size-4" aria-hidden />
                  Admin
                </Link>
              ) : null}
              <button
                type="button"
                onClick={() => void signOut()}
                className="flex h-12 items-center px-4 text-left text-sm font-medium"
              >
                Sign out
              </button>
            </nav>
          </div>
        </div>
      ) : null}
    </>
  );
}

function MenuLink({
  href,
  label,
  active,
  onNavigate,
}: {
  href: string;
  label: string;
  active: boolean;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className="flex h-12 items-center px-4 text-sm font-medium"
    >
      {label}
    </Link>
  );
}
