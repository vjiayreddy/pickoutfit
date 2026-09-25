import Link from "next/link";
import { routes } from "@/lib/routes";

export function SiteFooter() {
  return (
    <footer className="bg-ink text-canvas">
      <div className="mx-auto max-w-[1440px] px-4 py-14 sm:px-8 sm:py-20">
        <div className="flex flex-col items-start gap-8 md:flex-row md:items-end md:justify-between">
          <h2 className="max-w-[14ch] font-display text-4xl leading-[0.95] font-medium tracking-tight sm:text-5xl">
            Your next look is already yours.
          </h2>
          <Link
            href={routes.signUp}
            className="inline-flex h-12 items-center rounded-full bg-canvas px-8 text-sm font-medium text-ink transition active:scale-95 active:opacity-50"
          >
            Get started free
          </Link>
        </div>
        <div className="mt-12 flex flex-col gap-4 border-t border-white/25 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-display text-xl font-medium tracking-tight uppercase">WardrobeAI</p>
          <p className="text-xs text-white/65">Same wardrobe. New possibilities.</p>
          <Link href={routes.signIn} className="text-sm text-white/80 transition hover:text-canvas">
            Sign in
          </Link>
        </div>
      </div>
    </footer>
  );
}
