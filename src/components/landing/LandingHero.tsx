import Link from "next/link";
import { PLANS } from "@convex/shared/credits";
import { formatCredits } from "@/lib/format";
import { routes } from "@/lib/routes";

export function LandingHero() {
  return (
    <section className="relative min-h-[min(92vh,920px)] overflow-hidden bg-ink text-canvas">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/landing/editorial-man.webp"
        alt=""
        className="absolute inset-0 h-full w-full object-cover object-[70%_20%] opacity-55"
        fetchPriority="high"
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-t from-ink via-ink/55 to-ink/20"
      />
      <div className="relative z-10 mx-auto flex min-h-[min(92vh,920px)] max-w-[1440px] flex-col justify-end px-4 pb-12 pt-24 sm:px-8 sm:pb-24 sm:pt-28">
        <h1 className="max-w-3xl font-display text-5xl font-medium uppercase leading-[0.9] tracking-tight sm:text-7xl lg:text-8xl">
          Digitize.
          <br />
          Style.
          <br />
          Try on.
        </h1>
        <p className="mt-6 max-w-md text-base text-white/75 sm:text-lg">
          Photograph your clothes, build outfits with Eve, and see yourself wearing them —
          metered in credits so every render stays sharp.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link
            href={routes.signUp}
            className="inline-flex h-12 items-center rounded-full bg-canvas px-8 text-base font-medium text-ink transition active:scale-95 active:opacity-50"
          >
            Get started
          </Link>
          <a
            href="#how-it-works"
            className="inline-flex h-12 items-center rounded-full border border-white/30 px-8 text-base font-medium text-canvas transition active:scale-95 active:opacity-50"
          >
            How it works
          </a>
        </div>
        <p className="mt-5 text-sm text-white/60">
          {formatCredits(PLANS.free.signupCredits)} free. No card needed.
        </p>
      </div>
    </section>
  );
}
