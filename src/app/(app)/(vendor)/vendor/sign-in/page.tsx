import type { Metadata } from "next";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { AuthForm } from "@/components/AuthForm";
import { routes } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your WardrobeAI store desk.",
};

export default function VendorSignInPage() {
  return (
    <AuthScreen
      mode="sign-in"
      audience="vendor"
      title="Sign in"
      subtitle="Access your store desk — products, discounts, and collections."
    >
      <AuthForm
        mode="sign-in"
        redirectTo={routes.vendor}
        switchHref={routes.vendorSignUp}
        switchLabel="Create a seller account"
      />
    </AuthScreen>
  );
}
