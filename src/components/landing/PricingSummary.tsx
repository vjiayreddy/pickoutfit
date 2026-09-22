import Link from "next/link";
import { Plus } from "lucide-react";
import { PLANS, PLAN_IDS, type PlanDefinition, type PlanId } from "@convex/shared/credits";
import { LandingFaq } from "@/components/landing/LandingFaq";
import { FEATURE_LABELS } from "@/components/landing/plan-copy";
import { formatCredits, formatUsd, pluralize } from "@/lib/format";
import { routes } from "@/lib/routes";

const PLAN_COPY: Record<PlanId, { introduction: string; cta: string }> = {
  free: { introduction: "Find your first new favourite.", cta: "Start free" },
  pro: { introduction: "Make it an everyday thing.", cta: "Get started with Pro" },
  plus: { introduction: "For the full picture.", cta: "Get started with Plus" },
};

function planPerks(plan: PlanDefinition): string[] {
  return [
    "Wardrobe, outfit builder & stylist",
    pluralize(plan.maxAvatars, "personal photo"),
    ...plan.features.map((feature) => FEATURE_LABELS[feature]),
  ];
}

export function PricingSummary() {
  return (
    <section
      id="pricing"
      aria-labelledby="pricing-heading"
      className="scroll-mt-16 border-t border-hairline bg-canvas px-4 py-16 text-ink sm:px-8 sm:py-24"
    >
      <div className="mx-auto max-w-[1440px]">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-mute">Find your fit</p>
            <h2
              id="pricing-heading"
              className="mt-3 max-w-[12ch] font-display text-4xl font-medium uppercase leading-[0.9] tracking-tight sm:text-5xl"
            >
              Start small.
              <br />
              Style endlessly.
            </h2>
          </div>
          <p className="max-w-xs text-sm leading-relaxed text-mute md:pb-1">
            Every plan includes your digital wardrobe, outfit builder and personal stylist. Pick the
            credit allowance that works for you.
          </p>
        </div>
        <div className="mt-12 grid border-y border-hairline md:grid-cols-3 md:divide-x md:divide-hairline">
          {PLAN_IDS.map((planId, index) => {
            const plan = PLANS[planId];
            const copy = PLAN_COPY[planId];
            const allowance = plan.monthlyCredits || plan.signupCredits;
            return (
              <article
                key={plan.id}
                aria-labelledby={`plan-${plan.id}`}
                className="flex flex-col border-b border-hairline py-8 last:border-b-0 md:border-b-0 md:px-7 md:py-10 md:first:pl-0 md:last:pr-0 lg:px-10"
              >
                <div className="flex items-baseline justify-between gap-4">
                  <h3 id={`plan-${plan.id}`} className="text-xl font-medium tracking-tight">
                    {plan.name}
                  </h3>
                  <span className="font-mono text-[10px] text-mute" aria-hidden>
                    / 0{index + 1}
                  </span>
                </div>
                <p className="mt-2 text-sm text-mute">{copy.introduction}</p>
                <p className="mt-8 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="font-display text-5xl font-medium uppercase leading-none tracking-tight tabular-nums">
                    {formatUsd(plan.priceUsd)}
                  </span>
                  <span className="text-xs text-mute">
                    {plan.priceUsd > 0 ? "/ month" : "to start"}
                  </span>
                </p>
                <p className="mt-6 text-base font-medium tracking-tight">
                  {formatCredits(allowance)}
                  <span className="ml-1.5 text-sm font-normal text-mute">
                    {plan.monthlyCredits ? "every cycle" : "on signup"}
                  </span>
                </p>
                <ul className="mt-6 mb-10 flex flex-1 flex-col gap-3 text-sm text-mute">
                  {planPerks(plan).map((perk) => (
                    <li key={perk} className="flex items-start gap-2.5">
                      <Plus aria-hidden className="mt-0.5 size-3.5 shrink-0 text-ink/70" />
                      {perk}
                    </li>
                  ))}
                </ul>
                <Link
                  href={routes.signUp}
                  className="group flex min-h-12 items-center justify-between gap-4 border-t border-hairline pt-4 text-sm font-medium"
                >
                  {copy.cta}
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-hairline transition group-hover:bg-ink group-hover:text-canvas">
                    →
                  </span>
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
