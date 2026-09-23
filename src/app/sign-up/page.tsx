import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";

export default function SignUpPage() {
  return (
    <div className="flex min-h-full flex-col bg-canvas">
      <header className="flex h-14 items-center px-4 pt-[env(safe-area-inset-top)] sm:px-8">
        <Link
          href="/"
          className="font-display text-xl font-medium uppercase tracking-tight text-ink"
        >
          WardrobeAI
        </Link>
      </header>
      <div className="flex flex-1 flex-col items-center justify-center px-4 pb-16">
        <h1 className="mb-2 font-display text-3xl font-medium uppercase tracking-tight text-ink sm:text-5xl">
          Join
        </h1>
        <p className="mb-8 text-base text-mute">
          Get 25 free credits when you create an account.
        </p>
        <AuthForm mode="sign-up" />
      </div>
    </div>
  );
}
