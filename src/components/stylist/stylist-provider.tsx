"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { authClient } from "@/lib/auth-client";
import type { StylistPageContext } from "@/lib/stylist-context";

type StylistPanelState = {
  open: boolean;
  selectedThreadId: string | null;
  contextOverride: StylistPageContext | null;
  toggle: () => void;
  setOpen: (open: boolean) => void;
  openThread: (threadId?: string) => void;
  setContextOverride: (context: StylistPageContext | null) => void;
};

const StylistPanelContext = createContext<StylistPanelState | null>(null);

export function StylistProvider({ children }: { children: ReactNode }) {
  const session = authClient.useSession();
  const userId = session.data?.user?.id ?? "signed-out";
  return <AccountStylistProvider key={userId}>{children}</AccountStylistProvider>;
}

function AccountStylistProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [contextOverride, setContextOverride] = useState<StylistPageContext | null>(null);
  const toggle = useCallback(() => setOpen((value) => !value), []);
  const openThread = useCallback((threadId?: string) => {
    setSelectedThreadId(threadId ?? null);
    setOpen(true);
  }, []);
  const value = useMemo(
    () => ({ open, selectedThreadId, contextOverride, toggle, setOpen, openThread, setContextOverride }),
    [open, selectedThreadId, contextOverride, toggle, openThread],
  );
  return <StylistPanelContext value={value}>{children}</StylistPanelContext>;
}

export function useStylistPanel() {
  const context = useContext(StylistPanelContext);
  if (!context) throw new Error("useStylistPanel must be used inside StylistProvider.");
  return context;
}
