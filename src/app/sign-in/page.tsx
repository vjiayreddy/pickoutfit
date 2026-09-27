import type { Metadata } from "next";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { AuthForm } from "@/components/AuthForm";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your WardrobeAI account.",
};

export default function SignInPage() {
  return (
    <AuthScreen
      mode="sign-in"
      title="Sign in"
      subtitle="Access your wardrobe, outfits, and try-ons."
    >
      <AuthForm mode="sign-in" />
    </AuthScreen>
  );
}
