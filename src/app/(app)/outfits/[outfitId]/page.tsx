"use client";

import { use } from "react";
import { OutfitDetail } from "@/components/outfits/OutfitDetail";

export default function OutfitPage({
  params,
}: {
  params: Promise<{ outfitId: string }>;
}) {
  const { outfitId } = use(params);
  return <OutfitDetail outfitId={outfitId} />;
}
