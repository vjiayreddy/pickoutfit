"use client";

import { use } from "react";
import { StylistChatRoute } from "@/components/stylist/stylist-chat-route";

export default function StylistThreadPage({
  params,
  searchParams,
}: {
  params: Promise<{ threadId: string }>;
  searchParams: Promise<{ brief?: string | string[] }>;
}) {
  const { threadId } = use(params);
  const query = use(searchParams);
  const brief = query.brief;
  const initialBrief = typeof brief === "string" && brief.trim().length > 0 ? brief : undefined;

  return <StylistChatRoute threadId={threadId} initialBrief={initialBrief} />;
}
