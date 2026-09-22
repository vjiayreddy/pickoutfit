"use client";

import { use } from "react";
import { ItemDetail } from "@/components/wardrobe/ItemDetail";

export default function ItemPage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const { itemId } = use(params);
  return <ItemDetail itemId={itemId} />;
}
