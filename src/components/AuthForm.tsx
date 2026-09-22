"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { authClient } from "@/lib/auth-client";

type Mode = "sign-in" | "sign-up";

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      if (mode === "sign-up") {
        const result = await authClient.signUp.email({
          name: name.trim() || email.split("@")[0] || "Member",
          email: email.trim(),
          password,
        });
        if (result.error) {
          setError(result.error.message ?? "Could not create account.");
          return;
        }
      } else {
        const result = await authClient.signIn.email({
          email: email.trim(),
          password,
        });
        if (result.error) {
          setError(result.error.message ?? "Could not sign in.");
          return;
        }
      }
      router.replace("/wardrobe");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  const isSignUp = mode === "sign-up";

  return (
    <form onSubmit={onSubmit} className="flex w-full max-w-md flex-col gap-4">
      {isSignUp ? (
        <label className="flex flex-col gap-2 text-sm font-medium text-ink">
          Name
          <input
            type="text"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-12 rounded-[24px] border border-hairline bg-soft-cloud px-4 text-base font-normal outline-none focus:border-ink focus:bg-canvas"
            placeholder="Your name"
          />
        </label>
      ) : null}

      <label className="flex flex-col gap-2 text-sm font-medium text-ink">
        Email
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-12 rounded-[24px] border border-hairline bg-soft-cloud px-4 text-base font-normal outline-none focus:border-ink focus:bg-canvas"
          placeholder="you@example.com"
        />
      </label>

      <label className="flex flex-col gap-2 text-sm font-medium text-ink">
        Password
        <input
          type="password"
          required
          minLength={8}
          autoComplete={isSignUp ? "new-password" : "current-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="h-12 rounded-[24px] border border-hairline bg-soft-cloud px-4 text-base font-normal outline-none focus:border-ink focus:bg-canvas"
          placeholder="At least 8 characters"
        />
      </label>

      {error ? (
        <p className="text-sm font-medium text-sale" role="alert">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 flex h-12 items-center justify-center rounded-full bg-ink px-8 text-base font-medium text-canvas transition active:scale-95 active:opacity-50 disabled:opacity-50"
      >
        {pending ? "Please wait…" : isSignUp ? "Create account" : "Sign in"}
      </button>

      <p className="text-sm text-mute">
        {isSignUp ? (
          <>
            Already have an account?{" "}
            <Link href="/sign-in" className="font-medium text-ink underline">
              Sign in
            </Link>
          </>
        ) : (
          <>
            New here?{" "}
            <Link href="/sign-up" className="font-medium text-ink underline">
              Create an account
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
