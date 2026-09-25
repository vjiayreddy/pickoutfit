import Link from "next/link";
import { Check } from "lucide-react";
import { PLANS, PLAN_IDS, type PlanDefinition, type PlanId } from "@convex/shared/credits";
import { LandingFaq } from "@/components/landing/LandingFaq";
import { FEATURE_LABELS } from "@/components/landing/plan-copy";
import { formatCredits, formatUsd, pluralize } from "@/lib/format";
import { routes } from "@/lib/routes";

const PLAN_COPY: Record<PlanId, { cta: string }> = {
  free: { cta: "Start free" },
  pro: { cta: "Choose Pro" },
  plus: { cta: "Choose Plus" },
};

function planPerks(plan: PlanDefinition): string[] {
  return [
    "Wardrobe, outfit builder and stylist",
    pluralize(plan.maxAvatars, "personal photo"),
    ...plan.features.map((feature) => FEATURE_LABELS[feature]),
  ];
}

export function PricingSummary() {
  return (
    <section
      id="pricing"
      aria-labelledby="pricing-heading"
      className="scroll-mt-20 border-t border-hairline bg-canvas px-4 py-16 text-ink sm:px-8 md:py-24"
    >
      <div className="mx-auto max-w-[1440px]">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <p className="text-xs font-medium tracking-wide text-mute uppercase">
              Room for every kind of wardrobe
            </p>
            <h2
              id="pricing-heading"
              className="mt-3 max-w-md font-display text-4xl leading-[0.95] font-medium tracking-tight md:text-5xl"
            >
              Start small. Style endlessly.
            </h2>
          </div>
          <p className="max-w-xs text-sm leading-relaxed text-mute md:pb-1 md:text-right">
            Your wardrobe, outfit builder and personal stylist are included in every plan.
          </p>
        </div>
        <div className="mt-14 grid items-stretch gap-4 pt-3 md:grid-cols-3 md:gap-5">
          {PLAN_IDS.map((planId) => {
            const plan = PLANS[planId];
            const copy = PLAN_COPY[planId];
            const allowance = plan.monthlyCredits || plan.signupCredits;
            const featured = planId === "pro";
            return (
              <article
                key={plan.id}
                aria-labelledby={`plan-${plan.id}`}
                className={
                  featured
                    ? "relative flex flex-col bg-ink p-6 text-canvas md:p-7"
                    : "flex flex-col border border-hairline bg-canvas p-6 text-ink md:p-7"
                }
              >
                {featured ? (
                  <p className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-hairline bg-canvas px-3 py-1 text-[10px] font-medium tracking-[0.14em] text-ink uppercase">
                    Most popular
                  </p>
                ) : null}
                <h3 id={`plan-${plan.id}`} className="text-xl font-medium tracking-tight">
                  {plan.name}
                </h3>
                <p className="mt-6 flex flex-wrap items-baseline gap-x-2">
                  <span className="font-display text-5xl leading-none font-medium tracking-tight tabular-nums">
                    {plan.priceUsd === 0 ? "$0" : formatUsd(plan.priceUsd)}
                  </span>
                  <span className={featured ? "text-xs text-white/65" : "text-xs text-mute"}>
                    {plan.priceUsd > 0 ? "/ month" : "to start"}
                  </span>
                </p>
                <p className="mt-4 text-sm font-medium">
                  {formatCredits(allowance)}
                  <span className={featured ? "ml-1.5 font-normal text-white/65" : "ml-1.5 font-normal text-mute"}>
                    {plan.monthlyCredits ? "every cycle" : "on signup"}
                  </span>
                </p>
                <ul
                  className={
                    featured
                      ? "mt-6 mb-8 flex flex-1 flex-col gap-3 text-sm text-white/75"
                      : "mt-6 mb-8 flex flex-1 flex-col gap-3 text-sm text-mute"
                  }
                >
                  {planPerks(plan).map((perk) => (
                    <li key={perk} className="flex items-start gap-2.5">
                      <Check
                        aria-hidden
                        className={featured ? "mt-0.5 size-4 shrink-0 text-canvas" : "mt-0.5 size-4 shrink-0 text-ink"}
                      />
                      {perk}
                    </li>
                  ))}
                </ul>
                <Link
                  href={routes.signUp}
                  className={
                    featured
                      ? "inline-flex h-12 items-center justify-center rounded-full bg-canvas px-6 text-sm font-medium text-ink transition active:scale-95 active:opacity-50"
                      : "inline-flex h-12 items-center justify-center rounded-full border border-ink px-6 text-sm font-medium text-ink transition active:scale-95 active:opacity-50"
                  }
                >
                  {copy.cta}
                </Link>
              </article>
            );
          })}
        </div>
        <LandingFaq />
      </div>
    </section>
  );
}
