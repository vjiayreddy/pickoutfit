import Link from "next/link";
import { PLANS } from "@convex/shared/credits";
import { formatCredits } from "@/lib/format";
import { routes } from "@/lib/routes";

const LINKS = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
  { href: routes.signIn, label: "Sign in" },
] as const;

export function SiteFooter() {
  return (
    <footer className="overflow-hidden bg-ink text-canvas">
      <div className="mx-auto max-w-[1440px] px-4 pt-14 sm:px-8 sm:pt-20">
        <div className="flex flex-col justify-between gap-8 pb-14 md:flex-row md:items-end md:pb-20">
          <h2 className="max-w-[12ch] font-display text-4xl font-medium uppercase leading-[0.95] tracking-tight sm:text-5xl">
            Your next look
            <br />
            is already yours.
          </h2>
          <div className="flex flex-col items-start md:items-end">
            <Link
              href={routes.signUp}
              className="inline-flex h-12 items-center rounded-full bg-canvas px-8 text-sm font-medium text-ink transition active:scale-95 active:opacity-50"
            >
              Get started
            </Link>
            <p className="mt-4 text-xs text-white/65">
              {formatCredits(PLANS.free.signupCredits)} to make your first move.
            </p>
          </div>
        </div>
        <div className="flex flex-col justify-between gap-5 border-t border-white/25 pt-6 sm:flex-row sm:items-center">
          <p className="font-mono text-[10px] tracking-[0.13em] text-white/65 uppercase">
            Same wardrobe. New possibilities.
          </p>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-3 text-xs">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-white/80 transition hover:text-canvas"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <p
          aria-hidden
          className="mt-10 -ml-[0.04em] pb-2 font-display text-[clamp(3.5rem,18vw,14rem)] leading-[0.85] font-medium tracking-tight uppercase"
        >
          WardrobeAI
        </p>
      </div>
    </footer>
  );
}
