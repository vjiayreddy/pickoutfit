import Link from "next/link";
import type { ReactNode } from "react";
import { routes } from "@/lib/routes";

type Mode = "sign-in" | "sign-up";
type Audience = "shopper" | "vendor" | "platform";

const PANEL: Record<
  Audience,
  Record<Mode, { image: string; eyebrow: string; headline: string; detail: string }>
> = {
  shopper: {
    "sign-in": {
      image: "/landing/editorial-man.webp",
      eyebrow: "Welcome back",
      headline: "Your closet,\nready.",
      detail: "Outfits, try-ons, and Eve are saved to this account.",
    },
    "sign-up": {
      image: "/landing/editorial-woman.webp",
      eyebrow: "Free to start",
      headline: "See it\non you.",
      detail: "Photograph what you own, build outfits, and preview them before you wear them.",
    },
  },
  vendor: {
    "sign-in": {
      image: "/landing/editorial-man.webp",
      eyebrow: "Store desk",
      headline: "Sell next\nto their closet.",
      detail: "Manage products, discounts, and collections from one desk.",
    },
    "sign-up": {
      image: "/landing/editorial-woman.webp",
      eyebrow: "Sell on WardrobeAI",
      headline: "Open your\nstore.",
      detail: "List pieces that show up beside what shoppers already own. Free to start.",
    },
  },
  platform: {
    "sign-in": {
      image: "/landing/editorial-man.webp",
      eyebrow: "Platform",
      headline: "Run the\nmarketplace.",
      detail: "Approve vendors, manage users, and keep the credit meter healthy.",
    },
    "sign-up": {
      image: "/landing/editorial-woman.webp",
      eyebrow: "Platform",
      headline: "Invite\nonly.",
      detail: "Platform accounts are provisioned by the team — use your assigned credentials.",
    },
  },
};

const AUDIENCE_LABEL: Partial<Record<Audience, string>> = {
  vendor: "Sellers",
  platform: "Platform",
};

export function AuthScreen({
  mode,
  audience = "shopper",
  title,
  subtitle,
  children,
}: {
  mode: Mode;
  audience?: Audience;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  const panel = PANEL[audience][mode];
  const label = AUDIENCE_LABEL[audience];

  return (
    <div className="grid min-h-dvh bg-canvas lg:grid-cols-2">
      <aside className="relative hidden min-h-dvh overflow-hidden bg-ink text-canvas lg:block">
        <img
          src={panel.image}
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-top"
        />
        <div className="absolute inset-x-0 bottom-0 bg-ink px-10 pt-8 pb-10 xl:px-14 xl:pt-10 xl:pb-14">
          <p className="text-xs font-medium tracking-[0.14em] text-canvas/80 uppercase">
            {panel.eyebrow}
          </p>
          <p className="mt-3 max-w-lg font-display text-[clamp(3.5rem,5vw,6rem)] leading-[0.9] whitespace-pre-line uppercase">
            {panel.headline}
          </p>
          <p className="mt-4 max-w-sm text-base leading-relaxed text-canvas/80">{panel.detail}</p>
        </div>
      </aside>

      <div className="flex min-h-dvh flex-col">
        <header className="shrink-0 border-b border-hairline px-4 pt-[env(safe-area-inset-top)] sm:px-8 lg:border-b-0 lg:px-12 xl:px-16">
          <div className="flex h-14 items-center sm:h-16">
            <Link
              href={routes.home}
              className="font-display text-xl tracking-tight text-ink uppercase"
            >
              WardrobeAI
            </Link>
            {label ? (
              <span className="ml-3 text-xs font-medium tracking-[0.14em] text-mute uppercase">
                {label}
              </span>
            ) : null}
          </div>
        </header>

        <main className="flex flex-1 flex-col overflow-y-auto px-4 py-8 pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-8 sm:py-10 lg:px-12 lg:py-12 xl:px-16">
          <div className="mx-auto my-auto w-full max-w-[26rem] lg:mx-0">
            <h1 className="font-display text-[clamp(2.75rem,10vw,3.75rem)] leading-[0.9] tracking-tight text-ink uppercase">
              {title}
            </h1>
            <p className="mt-3 text-base leading-relaxed text-mute sm:mt-4">{subtitle}</p>
            <div className="mt-8 sm:mt-10">{children}</div>
          </div>
        </main>
      </div>
    </div>
  );
}
