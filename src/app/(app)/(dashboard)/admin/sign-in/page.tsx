import type { Metadata } from "next";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { AuthForm } from "@/components/AuthForm";
import { routes } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to the WardrobeAI platform desk.",
};

export default function AdminSignInPage() {
  return (
    <AuthScreen
      mode="sign-in"
      audience="platform"
      title="Sign in"
      subtitle="Platform management — vendors, users, and marketplace ops."
    >
      <AuthForm
        mode="sign-in"
        redirectTo={routes.admin}
        switchHref={routes.signIn}
        switchLabel="Shopper sign in"
      />
    </AuthScreen>
  );
}
