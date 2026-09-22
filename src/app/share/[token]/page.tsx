"use client";

import { use } from "react";
import { SharedRender } from "@/components/share/SharedRender";

export default function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  return <SharedRender token={token} />;
}
