import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";

export default function UsersLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
