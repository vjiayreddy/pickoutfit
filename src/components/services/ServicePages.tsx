"use client";

import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { RenderQuality } from "@convex/shared/credits";
import {
  groomingShopQuery,
  hairStylesFor,
  orderHairStyles,
  validateGroomingSelection,
  type BeardStyle,
  type HairStyle,
} from "@convex/shared/grooming";
import {
  isServiceAvailable,
  isServiceId,
  SERVICES,
  type ServiceId,
} from "@convex/shared/services";
import { shopSimilarVisible, storeLinks } from "@convex/shared/shop";
import type { Presentation } from "@convex/shared/wardrobe";
import { CreditQuote, useCreditQuote } from "@/components/common/CreditQuote";
import { GroomingPicker } from "@/components/renders/GroomingPicker";
import { reportError, toClientError } from "@/lib/client-errors";
import { cn } from "@/lib/cn";
import { routes } from "@/lib/routes";

const PAGE_SIZE = 8;

export function ServicesHub() {
  const me = useQuery(api.users.me);
  if (me === undefined) {
    return <div className="h-64 animate-pulse bg-soft-cloud" />;
  }
  if (!me) return null;
  const services = (Object.keys(SERVICES) as ServiceId[])
    .map((id) => ({ id, ...SERVICES[id] }))
    .filter((service) => service.audience.includes(me.prefs.presentation));

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-mute sm:text-sm">
          Beyond the wardrobe
        </p>
        <h1 className="mt-1 font-display text-3xl font-medium uppercase leading-[0.9] tracking-tight sm:text-5xl">
          Services
        </h1>
        <p className="mt-2 max-w-md text-sm text-mute sm:text-base">
          The same fitting photo. Hair and beard now. Skincare when it is ready.
        </p>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {services.map((service) => {
          const muted = service.status !== "live";
          const href = service.id === "wardrobe" ? routes.wardrobe : service.route;
          const primary = service.id === "wardrobe";
          return (
            <li key={service.id}>
              <article
                className={cn(
                  "flex h-full flex-col gap-4 border border-hairline p-6",
                  muted && "opacity-50",
                )}
              >
                <div className="space-y-2">
                  <h2 className="text-xl font-medium">{service.label}</h2>
                  <p className="text-sm text-mute">{service.blurb}</p>
                </div>
                {muted ? (
                  <p className="mt-auto text-sm font-medium">Coming soon</p>
                ) : (
                  <Link
                    href={href}
                    className={cn(
                      "mt-auto inline-flex h-12 items-center justify-center rounded-full px-6 text-sm font-medium",
                      primary ? "bg-ink text-canvas" : "bg-soft-cloud text-ink",
                    )}
                  >
                    Open
                  </Link>
                )}
              </article>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function ServiceStudio({ serviceId }: { serviceId: string }) {
  const me = useQuery(api.users.me);
  const profiles = useQuery(api.services.listProfiles);
  if (!isServiceId(serviceId) || (serviceId !== "hairstyle" && serviceId !== "beard" && serviceId !== "skincare")) {
    return (
      <p className="text-sm text-mute">
        That service is not available.{" "}
        <Link href={routes.services} className="underline">
          Back to services
        </Link>
      </p>
    );
  }
  if (me === undefined || profiles === undefined) {
    return <div className="h-64 animate-pulse bg-soft-cloud" />;
  }
  if (!me) return null;
  const service = SERVICES[serviceId];
  if (service.status !== "live" || !isServiceAvailable(serviceId, me)) {
    return (
      <div className="space-y-3">
        <h1 className="font-display text-4xl uppercase">{service.label}</h1>
        <p className="text-sm text-mute">
          {service.status === "coming_soon"
            ? "Coming soon. Advice and products will live here, with no photo edit."
            : "This service is not part of your wardrobe."}
        </p>
        <Link href={routes.services} className="text-sm font-medium underline">
          All services
        </Link>
      </div>
    );
  }
  if (serviceId !== "hairstyle" && serviceId !== "beard") {
    return (
      <div className="space-y-3">
        <h1 className="font-display text-4xl uppercase">{service.label}</h1>
        <p className="text-sm text-mute">This preview is not available yet.</p>
      </div>
    );
  }
  const profile = profiles.find((row) => row.serviceId === serviceId);
  return (
    <Studio
      serviceId={serviceId}
      presentation={me.prefs.presentation}
      profile={profile}
      hqUnlocked={me.balance.features.includes("hq_renders")}
      canShare={me.balance.features.includes("sharing")}
      showShop={shopSimilarVisible(me.prefs)}
    />
  );
}

function Studio({
  serviceId,
  presentation,
  profile,
  hqUnlocked,
  canShare,
  showShop,
}: {
  serviceId: "hairstyle" | "beard";
  presentation: Presentation;
  profile?: {
    hairLength?: "buzz" | "short" | "medium" | "long";
    texture?: "straight" | "wavy" | "curly" | "coily";
    hairGoal?: "keep" | "shorter" | "longer";
    beardNow?: "clean" | "stubble" | "short" | "full";
    beardGoal?: "keep" | "cleaner" | "fuller";
    budget: { tier: "value" | "mid" | "premium" };
  };
  hqUnlocked: boolean;
  canShare: boolean;
  showShop: boolean;
}) {
  const avatars = useQuery(api.avatars.list);
  const groom = useMutation(api.renders.groom);
  const share = useMutation(api.renders.share);
  const unshare = useMutation(api.renders.unshare);
  const removeRender = useMutation(api.renders.remove);
  const orderedHair = orderHairStyles(hairStylesFor(presentation), profile);
  const [hair, setHair] = useState<HairStyle>(
    orderedHair.find((style) => style !== "keep") ?? "keep",
  );
  const [beard, setBeard] = useState<BeardStyle>(defaultBeard(profile));
  const [custom, setCustom] = useState("");
  const [quality, setQuality] = useState<RenderQuality>("standard");
  const [avatarId, setAvatarId] = useState<Id<"avatars"> | null>(null);
  const [pending, setPending] = useState(false);
  const effectiveQuality: RenderQuality = hqUnlocked ? quality : "standard";
  const quote = useCreditQuote({ kind: "groom", quality: effectiveQuality });
  const looks = usePaginatedQuery(
    api.renders.listByKind,
    { kind: "groom", serviceId },
    { initialNumItems: PAGE_SIZE },
  );

  const defaultAvatar = avatars?.find((avatar) => avatar.isDefault) ?? avatars?.[0];
  const chosenAvatar = avatarId ?? defaultAvatar?._id ?? null;
  const hairValue = serviceId === "beard" ? "keep" : hair;
  const beardValue = serviceId === "hairstyle" || presentation !== "masculine" ? "keep" : beard;
  const selectionError = validateGroomingSelection(
    { hair: hairValue, beard: beardValue, custom: custom.trim() || undefined },
    presentation,
  );
  const styleForShop = serviceId === "hairstyle" ? hairValue : beardValue;
  const shopQuery = groomingShopQuery(serviceId, styleForShop, {
    texture: profile?.texture,
    tier: profile?.budget.tier,
  });
  const links = storeLinks(shopQuery);

  async function handleStart() {
    if (!chosenAvatar || selectionError || pending || quote?.canAfford === false) return;
    setPending(true);
    try {
      await groom({
        source: { type: "avatar", avatarId: chosenAvatar },
        hair: hairValue,
        beard: beardValue,
        custom: custom.trim() || undefined,
        quality: effectiveQuality,
        serviceId,
      });
      toast.success("Preview started. Watch progress in Activity.");
    } catch (error) {
      toast.error(reportError(error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-10">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-mute">
          {SERVICES[serviceId].label}
        </p>
        <h1 className="mt-1 font-display text-3xl font-medium uppercase leading-[0.9] sm:text-5xl">
          {serviceId === "hairstyle" ? "Try a cut." : "Try a beard."}
        </h1>
        <p className="mt-2 max-w-md text-sm text-mute">{SERVICES[serviceId].blurb}</p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">Fitting photo</h2>
        <div className="flex gap-2 overflow-x-auto">
          {(avatars ?? []).map((avatar) => (
            <button
              key={avatar._id}
              type="button"
              aria-pressed={(avatarId ?? defaultAvatar?._id) === avatar._id}
              onClick={() => setAvatarId(avatar._id)}
              className={cn(
                "w-24 shrink-0 space-y-1 text-left",
                (avatarId ?? defaultAvatar?._id) === avatar._id && "outline outline-2 outline-ink",
              )}
            >
              <div className="aspect-[3/4] bg-soft-cloud">
                {avatar.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatar.url} alt={avatar.label} className="h-full w-full object-cover" />
                ) : null}
              </div>
              <p className="truncate text-xs font-medium">{avatar.label}</p>
            </button>
          ))}
        </div>
      </section>

      <GroomingPicker
        presentation={presentation}
        mode={serviceId}
        hair={hairValue}
        beard={beardValue}
        custom={custom}
        hairStyles={orderedHair}
        onHair={setHair}
        onBeard={setBeard}
        onCustom={setCustom}
        disabled={pending}
      />

      {hqUnlocked ? (
        <div className="flex gap-2">
          {(["standard", "hq"] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={effectiveQuality === option}
              onClick={() => setQuality(option)}
              className={cn(
                "h-10 rounded-full px-4 text-sm font-medium uppercase",
                effectiveQuality === option ? "bg-ink text-canvas" : "border border-hairline",
              )}
            >
              {option === "hq" ? "HQ" : "Standard"}
            </button>
          ))}
        </div>
      ) : null}

      {selectionError ? <p className="text-sm text-mute">{selectionError}</p> : null}
      <CreditQuote quote={quote} label="preview" />
      <button
        type="button"
        disabled={pending || Boolean(selectionError) || !chosenAvatar || quote?.canAfford === false}
        onClick={() => void handleStart()}
        className="inline-flex h-12 items-center gap-2 rounded-full bg-ink px-8 text-base font-medium text-canvas disabled:opacity-50"
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        Start preview
      </button>

      <section className="space-y-4">
        <h2 className="text-sm font-medium">Recent looks</h2>
        {looks.status === "LoadingFirstPage" ? (
          <div className="h-40 animate-pulse bg-soft-cloud" />
        ) : looks.results.length === 0 ? (
          <p className="text-sm text-mute">No previews yet.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {looks.results.map((render) => (
              <li key={render._id} className="space-y-2">
                <div className="aspect-[3/4] bg-soft-cloud">
                  {render.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={render.url}
                      alt={render.groomingLabel ?? render.outfitName}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-mute capitalize">
                      {render.status}
                    </div>
                  )}
                </div>
                <p className="truncate text-sm font-medium">
                  {render.groomingLabel ?? render.outfitName}
                </p>
                <div className="flex flex-wrap gap-2">
                  {render.status === "done" ? (
                    <button
                      type="button"
                      className="h-10 rounded-full border border-hairline px-3 text-xs font-medium"
                      disabled={!canShare && !render.shareToken}
                      onClick={async () => {
                        try {
                          if (render.shareToken) {
                            await unshare({ renderId: render._id });
                            toast.success("Link revoked.");
                            return;
                          }
                          const { token } = await share({ renderId: render._id });
                          await navigator.clipboard.writeText(
                            `${window.location.origin}${routes.share(token)}`,
                          );
                          toast.success("Share link copied.");
                        } catch (error) {
                          const err = toClientError(error);
                          toast.error(
                            err.code === "FEATURE_LOCKED" ? "Sharing is on the Pro plan." : err.message,
                          );
                        }
                      }}
                    >
                      {render.shareToken ? "Unshare" : "Share"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="h-10 rounded-full px-3 text-xs font-medium text-mute"
                    onClick={async () => {
                      try {
                        await removeRender({ renderId: render._id });
                        toast.success("Look deleted.");
                      } catch (error) {
                        toast.error(reportError(error).message);
                      }
                    }}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {showShop ? (
        <section className="space-y-3">
          <h2 className="text-sm font-medium">Products for this style</h2>
          <p className="text-sm text-mute">{shopQuery}</p>
          <div className="flex flex-wrap gap-2">
            {links.map((link) => (
              <a
                key={link.store}
                href={link.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-10 items-center rounded-full bg-soft-cloud px-4 text-sm font-medium capitalize"
              >
                {link.store}
              </a>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function defaultBeard(profile?: {
  beardNow?: "clean" | "stubble" | "short" | "full";
  beardGoal?: "keep" | "cleaner" | "fuller";
}): BeardStyle {
  if (profile?.beardGoal === "cleaner") return "clean";
  if (profile?.beardGoal === "fuller") return "full";
  if (profile?.beardNow === "short") return "short_boxed";
  if (profile?.beardNow === "clean" || profile?.beardNow === "stubble" || profile?.beardNow === "full") {
    return profile.beardNow;
  }
  return "stubble";
}
