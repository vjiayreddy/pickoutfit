"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { EMPTY_DRAFT, OutfitForm } from "@/components/outfits/OutfitForm";
import { routes } from "@/lib/routes";

export default function NewOutfitPage() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-8">
      <Link
        href={routes.outfits}
        className="inline-flex items-center gap-2 text-sm font-medium text-mute hover:text-ink"
      >
        <ArrowLeft className="size-4" /> Outfits
      </Link>
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-mute">
          New outfit
        </p>
        <h1 className="mt-2 font-display text-4xl font-medium uppercase leading-[0.9] tracking-tight sm:text-5xl">
          Build a look.
        </h1>
        <p className="mt-4 max-w-md text-base text-mute">
          Fill the slots from your wardrobe, then save and try on.
        </p>
      </div>
      <OutfitForm mode="create" initial={EMPTY_DRAFT} />
    </div>
  );
}
