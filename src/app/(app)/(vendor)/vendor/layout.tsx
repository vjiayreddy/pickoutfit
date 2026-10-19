import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: {
    default: "Store desk",
    template: "%s · Store desk · WardrobeAI",
  },
  description: "Manage your products, discounts, collections, and orders.",
};

export default function VendorRootLayout({ children }: { children: ReactNode }) {
  return children;
}
