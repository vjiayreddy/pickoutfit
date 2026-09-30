import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: {
    default: "Platform",
    template: "%s · Platform · WardrobeAI",
  },
  description: "Platform management for vendors, users, and marketplace health.",
};

export default function AdminRootLayout({ children }: { children: ReactNode }) {
  return children;
}
