import type { ReactNode } from "react";
import { PlatformAuthGate } from "@/components/admin/PlatformAuthGate";
import { PlatformShell } from "@/components/admin/PlatformShell";

export default function PlatformDeskLayout({ children }: { children: ReactNode }) {
  return (
    <PlatformAuthGate>
      <PlatformShell>{children}</PlatformShell>
    </PlatformAuthGate>
  );
}
