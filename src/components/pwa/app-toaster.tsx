"use client";

import { useSyncExternalStore } from "react";
import { Toaster } from "sonner";

const QUERY = "(max-width: 1023px)";

function subscribe(listener: () => void) {
  const query = window.matchMedia(QUERY);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

export function AppToaster() {
  const compact = useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches, () => false);
  return (
    <Toaster
      position={compact ? "top-center" : "bottom-right"}
      richColors
      closeButton
      offset={compact ? "calc(var(--app-header-height) + 0.5rem)" : undefined}
    />
  );
}
