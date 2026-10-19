"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useId, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { routes } from "@/lib/routes";

type Mode = "sign-in" | "sign-up";

const fieldClassName =
  "h-12 w-full rounded-[24px] border-2 border-transparent bg-soft-cloud px-4 text-base font-normal text-ink outline-none transition-[background-color,border-color,box-shadow] placeholder:text-mute focus:border-ink focus:bg-canvas focus:shadow-[0_0_0_4px_var(--soft-cloud)]";

export function AuthForm({
  mode,
  redirectTo = routes.wardrobe,
  switchHref,
  switchLabel,
}: {
  mode: Mode;
  /** Where to land after a successful sign-in or sign-up. */
  redirectTo?: string;
  /** Override the opposite-mode link (defaults to consumer sign-in / sign-up). */
  switchHref?: string;
  /** Link text for the opposite mode. */
  switchLabel?: string;
}) {
  const router = useRouter();
  const formId = useId();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const isSignUp = mode === "sign-up";
  const oppositeHref =
    switchHref ?? (isSignUp ? routes.signIn : routes.signUp);
  const oppositeLabel =
    switchLabel ?? (isSignUp ? "Sign in" : "Create an account");

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
      router.replace(redirectTo);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  const passwordId = `${formId}-password`;

  return (
    <form onSubmit={onSubmit} className="flex w-full flex-col gap-5" aria-busy={pending}>
      {isSignUp ? (
        <label className="flex flex-col gap-2 text-sm font-medium text-ink" htmlFor={`${formId}-name`}>
          Name
          <input
            id={`${formId}-name`}
            name="name"
            type="text"
            autoComplete="name"
            enterKeyHint="next"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={fieldClassName}
            placeholder="Your name"
          />
        </label>
      ) : null}

      <label className="flex flex-col gap-2 text-sm font-medium text-ink" htmlFor={`${formId}-email`}>
        Email
        <input
          id={`${formId}-email`}
          name="email"
          type="email"
          required
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          inputMode="email"
          enterKeyHint="next"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={fieldClassName}
          placeholder="you@example.com"
        />
      </label>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-ink" htmlFor={passwordId}>
          Password
        </label>
        <div className="relative">
          <input
            id={passwordId}
            name="password"
            type={showPassword ? "text" : "password"}
            required
            minLength={8}
            autoComplete={isSignUp ? "new-password" : "current-password"}
            enterKeyHint="done"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={`${fieldClassName} pr-14`}
            placeholder={isSignUp ? "Create a password" : "Your password"}
            aria-describedby={isSignUp ? `${formId}-password-hint` : undefined}
          />
          <button
            type="button"
            onClick={() => setShowPassword((visible) => !visible)}
            className="absolute top-1/2 right-1 flex size-10 -translate-y-1/2 items-center justify-center rounded-full text-ink"
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
          >
            {showPassword ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>
        {isSignUp ? (
          <p id={`${formId}-password-hint`} className="text-xs font-medium text-mute">
            At least 8 characters.
          </p>
        ) : null}
      </div>

      {error ? (
        <p className="text-sm font-medium text-sale" role="alert">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="flex h-12 w-full items-center justify-center rounded-full bg-ink px-8 text-base font-medium text-canvas transition active:scale-95 active:opacity-50 disabled:opacity-50"
      >
        {pending ? "Please wait…" : isSignUp ? "Create account" : "Sign in"}
      </button>

      <p className="text-sm leading-relaxed text-mute">
        {isSignUp ? (
          <>
            Already have an account?{" "}
            <Link
              href={oppositeHref}
              className="font-medium text-ink underline underline-offset-4"
            >
              {oppositeLabel}
            </Link>
          </>
        ) : (
          <>
            New here?{" "}
            <Link
              href={oppositeHref}
              className="font-medium text-ink underline underline-offset-4"
            >
              {oppositeLabel}
            </Link>
          </>
        )}
      </p>
    </form>
  );
}

function EyeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M2.5 12S6.5 5.5 12 5.5 21.5 12 21.5 12 17.5 18.5 12 18.5 2.5 12 2.5 12Z"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 5.5 19.5 19M9.2 9.4A3.2 3.2 0 0 0 14.6 15M7.1 7.4C4.8 8.8 3 12 3 12s4 6.5 9 6.5c1.6 0 3-.5 4.2-1.2M10.2 6.1A9.4 9.4 0 0 1 12 5.5c5 0 9 6.5 9 6.5a16 16 0 0 1-2.2 2.9"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}
