import type { Metadata } from "next";
import { PLANS } from "@convex/shared/credits";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { AuthForm } from "@/components/AuthForm";
import { formatCredits } from "@/lib/format";

export const metadata: Metadata = {
  title: "Join",
  description: `Create a WardrobeAI account and get ${formatCredits(PLANS.free.signupCredits)}.`,
};

export default function SignUpPage() {
  return (
    <AuthScreen
      mode="sign-up"
      title="Join"
      subtitle={`Get ${formatCredits(PLANS.free.signupCredits)} when you create an account.`}
    >
      <AuthForm mode="sign-up" />
    </AuthScreen>
  );
}
