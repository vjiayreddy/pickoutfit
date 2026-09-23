"use client";

import { useAction, useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useEffectEvent } from "react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { PlanId } from "@convex/shared/credits";
import { reportError } from "@/lib/client-errors";
import { cn } from "@/lib/cn";
import { routes } from "@/lib/routes";

function formatUsd(n: number): string {
  if (n === 0) return "Free";
  return `$${n.toFixed(2)}/mo`;
}

function formatWhen(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function BillingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const status = useQuery(api.billing.status);
  const me = useQuery(api.users.me);
  const refresh = useMutation(api.billing.refresh);
  const createCheckout = useAction(api.billing.createCheckout);
  const createPortal = useAction(api.billing.createPortal);
  const grantForTesting = useMutation(api.billing.grantForTesting);
  const {
    results: ledger,
    status: ledgerStatus,
    loadMore,
  } = usePaginatedQuery(api.credits.ledger, {}, { initialNumItems: 20 });

  const [pendingPlan, setPendingPlan] = useState<"pro" | "plus" | null>(null);
  const [portalPending, setPortalPending] = useState(false);

  const onCheckoutReturn = useEffectEvent(async (checkout: string | null) => {
    if (checkout !== "success") return;
    try {
      await refresh({});
      toast.success("Subscription updated.");
    } catch (error) {
      toast.error(reportError(error).message);
    } finally {
      router.replace(routes.billing);
    }
  });

  useEffect(() => {
    void onCheckoutReturn(searchParams.get("checkout"));
  }, [searchParams]);

  async function upgrade(plan: "pro" | "plus") {
    setPendingPlan(plan);
    try {
      const session = await createCheckout({ plan });
      if (!session.url) {
        toast.error("Checkout did not return a URL.");
        return;
      }
      window.location.assign(session.url);
    } catch (error) {
      toast.error(reportError(error).message);
    } finally {
      setPendingPlan(null);
    }
  }

  async function openPortal() {
    setPortalPending(true);
    try {
      const { url } = await createPortal({});
      window.location.assign(url);
    } catch (error) {
      toast.error(reportError(error).message);
    } finally {
      setPortalPending(false);
    }
  }

  async function testGrant(plan: PlanId) {
    try {
      await grantForTesting({ plan });
      toast.success(`Granted ${plan} for testing.`);
    } catch (error) {
      toast.error(reportError(error).message);
    }
  }

  if (status === undefined || me === undefined || me === null) {
    return <p className="text-sm text-mute">Loading billing…</p>;
  }

  const currentPlan = status.plan;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 sm:space-y-12">
      <header className="space-y-2">
        <h1 className="font-display text-3xl font-medium tracking-tight sm:text-4xl">
          Billing
        </h1>
        <p className="text-base text-mute">
          {me.balance.total} credits available
          {status.planPeriodEnd
            ? ` · ${status.plan} renews ${formatWhen(status.planPeriodEnd)}`
            : ` · ${status.plan} plan`}
        </p>
        {!status.configured ? (
          <p className="rounded-none border border-hairline bg-soft-cloud px-4 py-3 text-sm text-mute">
            Stripe Checkout is not configured on this deployment yet. You can
            still review plans and your ledger; upgrades unlock after price IDs
            and keys are set.
          </p>
        ) : null}
      </header>

      <section className="space-y-4" aria-labelledby="plans-heading">
        <h2 id="plans-heading" className="text-base font-medium">
          Plans
        </h2>
        <ul className="grid gap-4 sm:grid-cols-3">
          {status.plans.map((plan) => {
            const isCurrent = plan.id === currentPlan;
            const isPaid = plan.id === "pro" || plan.id === "plus";
            return (
              <li
                key={plan.id}
                className={cn(
                  "flex flex-col gap-3 border border-hairline p-5",
                  isCurrent && "border-ink",
                )}
              >
                <div className="space-y-1">
                  <p className="text-sm font-medium uppercase tracking-wide">
                    {plan.name}
                    {isCurrent ? " · Current" : ""}
                  </p>
                  <p className="font-display text-2xl font-medium">
                    {formatUsd(plan.priceUsd)}
                  </p>
                  <p className="text-sm text-mute">{plan.blurb}</p>
                </div>
                {isPaid && !isCurrent ? (
                  <button
                    type="button"
                    disabled={!status.configured || pendingPlan !== null}
                    onClick={() => void upgrade(plan.id as "pro" | "plus")}
                    className="mt-auto flex h-12 w-full items-center justify-center rounded-full bg-ink text-sm font-medium text-canvas disabled:opacity-50"
                  >
                    {pendingPlan === plan.id
                      ? "Redirecting…"
                      : `Upgrade to ${plan.name}`}
                  </button>
                ) : isCurrent && isPaid ? (
                  <button
                    type="button"
                    disabled={!status.configured || portalPending}
                    onClick={() => void openPortal()}
                    className="mt-auto flex h-12 w-full items-center justify-center rounded-full bg-soft-cloud text-sm font-medium text-ink disabled:opacity-50"
                  >
                    {portalPending ? "Opening…" : "Manage subscription"}
                  </button>
                ) : (
                  <span className="mt-auto h-12" aria-hidden />
                )}
              </li>
            );
          })}
        </ul>
        {currentPlan !== "free" && status.configured ? (
          <button
            type="button"
            disabled={portalPending}
            onClick={() => void openPortal()}
            className="text-sm font-medium underline underline-offset-4"
          >
            Open customer portal
          </button>
        ) : null}
      </section>

      <section className="space-y-4" aria-labelledby="ledger-heading">
        <h2 id="ledger-heading" className="text-base font-medium">
          Credit ledger
        </h2>
        {ledger.length === 0 && ledgerStatus === "Exhausted" ? (
          <p className="text-sm text-mute">No ledger entries yet.</p>
        ) : (
          <ul className="divide-y divide-hairline border-y border-hairline">
            {ledger.map((line) => (
              <li
                key={line._id}
                className="flex items-baseline justify-between gap-4 py-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium">
                    {line.kind.replaceAll("_", " ")}
                    {line.note ? (
                      <span className="font-normal text-mute">
                        {" "}
                        · {line.note}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-mute">
                    {formatWhen(line.createdAt)} · {line.bucket}
                  </p>
                </div>
                <p
                  className={cn(
                    "shrink-0 font-medium",
                    line.delta < 0 ? "text-sale" : "text-ink",
                  )}
                >
                  {line.delta > 0 ? "+" : ""}
                  {line.delta}
                </p>
              </li>
            ))}
          </ul>
        )}
        {ledgerStatus === "CanLoadMore" ? (
          <button
            type="button"
            onClick={() => loadMore(20)}
            className="text-sm font-medium underline underline-offset-4"
          >
            Load more
          </button>
        ) : null}
      </section>

      {status.canTestGrant ? (
        <section className="space-y-3 border-t border-hairline pt-8">
          <h2 className="text-base font-medium">Test grants</h2>
          <p className="text-sm text-mute">
            Apply a plan without Stripe (admin or{" "}
            <code className="text-xs">ALLOW_DEV_SMOKE=1</code>).
          </p>
          <div className="flex flex-wrap gap-2">
            {(["free", "pro", "plus"] as const).map((plan) => (
              <button
                key={plan}
                type="button"
                onClick={() => void testGrant(plan)}
                className="h-10 rounded-full bg-soft-cloud px-4 text-sm font-medium"
              >
                Grant {plan}
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
