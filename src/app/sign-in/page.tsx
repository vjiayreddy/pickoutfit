import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";

export default function SignInPage() {
  return (
    <div className="flex min-h-full flex-col bg-canvas">
      <header className="flex h-14 items-center px-4 sm:px-8">
        <Link
          href="/"
          className="font-display text-xl font-medium uppercase tracking-tight text-ink"
        >
          WardrobeAI
        </Link>
      </header>
      <div className="flex flex-1 flex-col items-center justify-center px-4 pb-16">
        <h1 className="mb-2 font-display text-4xl font-medium uppercase tracking-tight text-ink sm:text-5xl">
          Sign in
        </h1>
        <p className="mb-8 text-base text-mute">
          Access your wardrobe and try-ons.
        </p>
        <AuthForm mode="sign-in" />
      </div>
    </div>
  );
}
