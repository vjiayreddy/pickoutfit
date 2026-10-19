import type { ReactNode } from "react";
import { VendorAuthGate } from "@/components/vendor/VendorAuthGate";
import { VendorDesk } from "@/components/vendor/VendorDesk";

export default function VendorDeskLayout({ children }: { children: ReactNode }) {
  return (
    <VendorAuthGate>
      <VendorDesk>{children}</VendorDesk>
    </VendorAuthGate>
  );
}
