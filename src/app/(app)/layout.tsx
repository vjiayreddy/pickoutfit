import type { ReactNode } from "react";

/** Shared authenticated app root — no chrome. Segment layouts own their shells. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return children;
}
