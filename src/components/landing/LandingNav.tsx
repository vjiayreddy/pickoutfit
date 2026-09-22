import Link from "next/link";
import { routes } from "@/lib/routes";

export function LandingNav() {
  return (
    <header className="sticky top-0 z-20 border-b border-white/10 bg-ink/90 text-canvas backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between px-4 sm:px-8">
        <Link
          href={routes.home}
          className="font-display text-xl font-medium uppercase tracking-tight"
        >
          WardrobeAI
        </Link>
        <nav className="hidden items-center gap-8 text-sm font-medium md:flex" aria-label="Main">
          <a href="#how-it-works" className="text-white/80 transition hover:text-canvas">
            How it works
          </a>
          <a href="#pricing" className="text-white/80 transition hover:text-canvas">
            Pricing
          </a>
          <a href="#faq" className="text-white/80 transition hover:text-canvas">
            FAQ
          </a>
        </nav>
        <div className="flex items-center gap-2">
          <Link
            href={routes.signIn}
            className="hidden rounded-full px-4 py-2 text-sm font-medium text-canvas sm:inline-flex"
          >
            Sign in
          </Link>
          <Link
            href={routes.signUp}
            className="inline-flex h-10 items-center rounded-full bg-canvas px-5 text-sm font-medium text-ink transition active:scale-95 active:opacity-50"
          >
            Get started
          </Link>
        </div>
      </div>
    </header>
  );
}
