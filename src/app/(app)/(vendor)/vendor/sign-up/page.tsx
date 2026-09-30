import type { Metadata } from "next";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { AuthForm } from "@/components/AuthForm";
import { routes } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Join as a seller",
  description: "Create a WardrobeAI seller account and open your store.",
};

export default function VendorSignUpPage() {
  return (
    <AuthScreen
      mode="sign-up"
      audience="vendor"
      title="Join"
      subtitle="Create a seller account, then open your store. Free to start."
    >
      <AuthForm
        mode="sign-up"
        redirectTo={routes.vendorRegister}
        switchHref={routes.vendorSignIn}
        switchLabel="Sign in"
      />
    </AuthScreen>
  );
}
