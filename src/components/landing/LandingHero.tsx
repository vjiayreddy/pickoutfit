import Link from "next/link";
import { PLANS } from "@convex/shared/credits";
import { FashionTryOnHero } from "@/components/landing/FashionTryOnHero";
import { formatCredits } from "@/lib/format";
import { routes } from "@/lib/routes";

export function LandingHero() {
  return (
    <section className="relative overflow-hidden bg-ink py-12 text-canvas sm:py-16 lg:py-20">
      <div className="mx-auto grid w-full max-w-[1440px] items-center gap-6 px-4 sm:px-8 md:grid-cols-2 md:gap-8 lg:gap-10">
        <div className="relative z-10 min-w-0 bg-ink md:max-w-[36rem]">
          <p className="text-xs font-medium tracking-wide text-soft-cloud uppercase">
            Meet your everyday style companion
          </p>
          <h1 className="mt-2 font-display text-[clamp(2rem,1rem+4vw,3.75rem)] leading-[0.95] font-medium tracking-tight lg:mt-3">
            More looks.
            <br />
            Less “what to wear?”
          </h1>
          <p className="mt-3 max-w-md text-base leading-relaxed text-soft-cloud lg:mt-4">
            Your wardrobe, reimagined. Digitize your clothes, build outfits with Eve, and see them
            on you.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3 lg:mt-8">
            <Link
              href={routes.signUp}
              className="inline-flex h-12 items-center rounded-full bg-canvas px-8 text-sm font-medium text-ink transition active:scale-95 active:opacity-50"
            >
              Find your next look
            </Link>
            <a
              href="#how-it-works"
              className="inline-flex min-h-11 items-center text-sm font-medium text-canvas underline underline-offset-4"
            >
              See how it works
            </a>
          </div>
          <p className="mt-3 text-xs text-soft-cloud lg:mt-4">
            {formatCredits(PLANS.free.signupCredits)} to get started. No card needed.
          </p>
        </div>
        <div className="relative z-0 flex justify-center">
          <FashionTryOnHero />
        </div>
      </div>
    </section>
  );
}
