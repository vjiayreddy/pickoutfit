"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { LandingHero } from "@/components/landing/LandingHero";
import { LandingNav } from "@/components/landing/LandingNav";
import { PricingSummary } from "@/components/landing/PricingSummary";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { authClient } from "@/lib/auth-client";
import { routes } from "@/lib/routes";

function LandingPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preview = searchParams.get("preview") === "landing";
  const session = authClient.useSession();

  useEffect(() => {
    if (session.isPending) return;
    if (session.data?.session && !preview) {
      router.replace(routes.wardrobe);
    }
  }, [session.isPending, session.data?.session, preview, router]);

  if (session.isPending) {
    return <div className="min-h-full bg-ink" aria-busy="true" />;
  }

  if (session.data?.session && !preview) {
    return <div className="min-h-full bg-ink" aria-busy="true" />;
  }

  return (
    <div className="min-h-full bg-canvas text-ink">
      <a
        href="#landing-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-4 focus:rounded-full focus:bg-canvas focus:px-4 focus:py-2 focus:text-ink"
      >
        Skip to content
      </a>
      <LandingNav />
      <main id="landing-content">
        <LandingHero />
        <HowItWorks />
        <PricingSummary />
      </main>
      <SiteFooter />
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<div className="min-h-full bg-ink" aria-busy="true" />}>
      <LandingPageInner />
    </Suspense>
  );
}
