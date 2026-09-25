import Link from "next/link";
import { routes } from "@/lib/routes";

const LINKS = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
] as const;

export function LandingNav() {
  return (
    <header className="sticky top-0 z-20 border-b border-hairline bg-canvas pt-[env(safe-area-inset-top)] text-ink">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-8">
        <Link
          href={routes.home}
          className="font-display text-xl font-medium tracking-tight uppercase"
        >
          WardrobeAI
        </Link>
        <nav className="hidden items-center gap-8 text-sm font-medium md:flex" aria-label="Main">
          {LINKS.map((link) => (
            <a key={link.href} href={link.href} className="text-mute transition hover:text-ink">
              {link.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link
            href={routes.signIn}
            className="hidden rounded-full px-4 py-2 text-sm font-medium text-ink md:inline-flex"
          >
            Sign in
          </Link>
          <Link
            href={routes.signUp}
            className="inline-flex h-10 items-center rounded-full bg-ink px-5 text-sm font-medium text-canvas transition active:scale-95 active:opacity-50"
          >
            Get started
          </Link>
        </div>
      </div>
    </header>
  );
}
