"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AppHeaderTitle } from "@/components/layout/app-header";
import { EMPTY_DRAFT, OutfitForm } from "@/components/outfits/OutfitForm";
import { routes } from "@/lib/routes";

export default function NewOutfitPage() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 sm:space-y-8">
      <AppHeaderTitle title="New outfit" />
      <Link
        href={routes.outfits}
        className="hidden items-center gap-2 text-sm font-medium text-mute hover:text-ink lg:inline-flex"
      >
        <ArrowLeft className="size-4" /> Outfits
      </Link>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-mute sm:text-sm">
          New outfit
        </p>
        <h1 className="mt-1 font-display text-3xl font-medium uppercase leading-[0.9] tracking-tight sm:mt-2 sm:text-5xl">
          Build a look.
        </h1>
        <p className="mt-2 max-w-md text-sm text-mute sm:mt-4 sm:text-base">
          Fill the slots from your wardrobe, then save and try on.
        </p>
      </div>
      <OutfitForm mode="create" initial={EMPTY_DRAFT} />
    </div>
  );
}
