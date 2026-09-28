import type { Metadata } from "next";
import { OwnerSignInForm } from "@/components/owner/OwnerSignInForm";

export const metadata: Metadata = { title: "Owner sign in" };

export default function OwnerSignInPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-4">
      <OwnerSignInForm />
    </main>
  );
}
