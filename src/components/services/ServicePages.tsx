"use client";

import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import Link from "next/link";
import { Loader2, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { RenderQuality } from "@convex/shared/credits";
import {
  groomingShopQuery,
  HAIR_LABELS,
  hairStylesFor,
  orderHairStyles,
  validateGroomingSelection,
  type BeardStyle,
  type HairStyle,
} from "@convex/shared/grooming";
import { categoryForService } from "@convex/shared/products";
import {
  isServiceAvailable,
  isServiceId,
  SERVICES,
} from "@convex/shared/services";
import { shopSimilarVisible, storeLinks } from "@convex/shared/shop";
import type { Presentation } from "@convex/shared/wardrobe";
import { CreditQuote, useCreditQuote } from "@/components/common/CreditQuote";
import { GroomingPicker } from "@/components/renders/GroomingPicker";
import { reportError, toClientError } from "@/lib/client-errors";
import { cn } from "@/lib/cn";
import { ProductRail } from "@/components/shop/ProductRail";
import { routes } from "@/lib/routes";

const PAGE_SIZE = 8;
const GALLERY_PAGE = 24;
const LOOK_PAGE = 24;

const COMING_SOON_STUDIOS: Record<string, { title: string; blurb: string }> = {
  "hair-color": {
    title: "Hair Color",
    blurb: "Preview a colour on your fitting photo.",
  },
  eyewear: {
    title: "Eyewear",
    blurb: "Try frames on your fitting photo.",
  },
  makeup: {
    title: "Makeup",
    blurb: "Try a makeup look on your fitting photo.",
  },
};

const HUB_SERVICES = [
  { label: "Hair Color", blurb: "Preview a colour on your fitting photo.", href: routes.service("hair-color"), live: false },
  { label: "Beard/Hair Style", blurb: "Try a cut or a beard on your fitting photo.", href: routes.service("hairstyle"), live: true },
  { label: "Eyewear", blurb: "Try frames on your fitting photo.", href: routes.service("eyewear"), live: false },
  { label: "Makeup", blurb: "Try a makeup look on your fitting photo.", href: routes.service("makeup"), live: false },
  { label: "SkinCare", blurb: "A routine matched to your skin and budget. Advice and products, no photo edit.", href: routes.service("skincare"), live: false },
] as const;

function ServiceCard({
  label,
  blurb,
  muted,
  href,
  primary,
}: {
  label: string;
  blurb: string;
  muted?: boolean;
  href?: string;
  primary?: boolean;
}) {
  return (
    <article
      className={cn(
        "flex h-full flex-col gap-4 border border-hairline p-6",
        muted && "opacity-50",
      )}
    >
      <div className="space-y-2">
        <h2 className="text-xl font-medium">{label}</h2>
        <p className="text-sm text-mute">{blurb}</p>
      </div>
      {muted || !href ? (
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
  );
}

export function ServicesHub() {
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
          Beard and hair style are ready. Colour, eyewear, makeup, and skincare are next.
        </p>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {HUB_SERVICES.map((service) => (
          <li key={service.label}>
            <ServiceCard
              label={service.label}
              blurb={service.blurb}
              muted={!service.live}
              href={service.live ? service.href : undefined}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ServiceWithProducts({
  serviceId,
  children,
}: {
  serviceId: string;
  children: ReactNode;
}) {
  const category = categoryForService(serviceId);
  return (
    <div className="space-y-10">
      {children}
      {category ? <ProductRail category={category} /> : null}
    </div>
  );
}

export function ServiceStudio({ serviceId }: { serviceId: string }) {
  const me = useQuery(api.users.me);
  const profiles = useQuery(api.services.listProfiles);
  const comingSoon = COMING_SOON_STUDIOS[serviceId];
  if (comingSoon) {
    return (
      <ServiceWithProducts serviceId={serviceId}>
        <div className="space-y-3">
          <h1 className="font-display text-4xl uppercase">{comingSoon.title}</h1>
          <p className="text-sm text-mute">Coming soon. {comingSoon.blurb}</p>
        </div>
      </ServiceWithProducts>
    );
  }
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
      <ServiceWithProducts serviceId={serviceId}>
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
      </ServiceWithProducts>
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
  const isHairStudio = serviceId === "hairstyle";
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
  const [renderId, setRenderId] = useState<Id<"renders"> | null>(null);
  const [pending, setPending] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const loadingGallery = useRef(false);
  const scannedLookPages = useRef(0);
  const effectiveQuality: RenderQuality = hqUnlocked ? quality : "standard";
  const tryOns = usePaginatedQuery(
    api.renders.listMine,
    isHairStudio ? {} : "skip",
    { initialNumItems: LOOK_PAGE },
  );
  const looks = usePaginatedQuery(
    api.renders.listByKind,
    { kind: "groom", serviceId },
    { initialNumItems: isHairStudio ? GALLERY_PAGE : PAGE_SIZE },
  );

  const galleryStatus = looks.status;
  const loadMoreGallery = looks.loadMore;
  useEffect(() => {
    if (!isHairStudio) return;
    if (galleryStatus !== "CanLoadMore") {
      loadingGallery.current = false;
      return;
    }
    if (loadingGallery.current) return;
    loadingGallery.current = true;
    loadMoreGallery(GALLERY_PAGE);
  }, [isHairStudio, galleryStatus, loadMoreGallery]);

  const tryOnStatus = tryOns.status;
  const loadMoreTryOns = tryOns.loadMore;
  const wardrobeLooks = tryOns.results.filter(
    (render) => render.kind === "try_on" && render.status === "done" && render.url,
  );
  useEffect(() => {
    if (!isHairStudio || tryOnStatus !== "CanLoadMore" || wardrobeLooks.length > 0) return;
    if (scannedLookPages.current >= 4) return;
    scannedLookPages.current += 1;
    loadMoreTryOns(LOOK_PAGE);
  }, [isHairStudio, tryOnStatus, loadMoreTryOns, wardrobeLooks.length]);

  const defaultAvatar = avatars?.find((avatar) => avatar.isDefault) ?? avatars?.[0];
  const selectedRender = renderId
    ? wardrobeLooks.find((render) => render._id === renderId)
    : undefined;
  const chosenAvatar = renderId ? null : (avatarId ?? defaultAvatar?._id ?? null);
  const selectedAvatar = (avatars ?? []).find((avatar) => avatar._id === chosenAvatar);
  const keepPreviewUrl = selectedRender?.url ?? selectedAvatar?.url ?? null;
  const quoteQuality = selectedRender?.quality ?? effectiveQuality;
  const quote = useCreditQuote({ kind: "groom", quality: quoteQuality });
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

  const hasSource = Boolean(selectedRender || chosenAvatar);
  const applyLabel = `Apply ${HAIR_LABELS[hairValue].toLowerCase()}`;
  const canApply = !pending && !selectionError && hasSource && quote?.canAfford !== false;

  async function handleStart() {
    if (!canApply) return;
    const source = selectedRender
      ? { type: "render" as const, renderId: selectedRender._id }
      : chosenAvatar
        ? { type: "avatar" as const, avatarId: chosenAvatar }
        : null;
    if (!source) return;
    setPending(true);
    try {
      await groom({
        source,
        hair: hairValue,
        beard: beardValue,
        custom: custom.trim() || undefined,
        quality: source.type === "avatar" ? quoteQuality : undefined,
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
    <div className="min-w-0 space-y-8 xl:space-y-10">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-mute">
          {SERVICES[serviceId].label}
        </p>
        <h1 className="mt-1 font-display text-3xl font-medium uppercase leading-[0.9] sm:text-4xl xl:text-5xl">
          {serviceId === "hairstyle" ? "Try a cut." : "Try a beard."}
        </h1>
        <p className="mt-2 max-w-md text-sm text-mute">{SERVICES[serviceId].blurb}</p>
      </div>

      {isHairStudio ? (
        <div className="grid min-w-0 gap-8 xl:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] xl:items-start xl:gap-10">
          <section className="min-w-0 space-y-3">
            <h2 className="text-sm font-medium">Look</h2>
            <div className="flex min-w-0 snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain pb-1 xl:grid xl:max-h-[32rem] xl:snap-none xl:grid-cols-2 xl:gap-3 xl:overflow-x-hidden xl:overflow-y-auto xl:pr-1">
              {(avatars ?? []).map((avatar) => (
                <LookCard
                  key={avatar._id}
                  label={avatar.label}
                  src={avatar.url}
                  active={!renderId && (avatarId ?? defaultAvatar?._id) === avatar._id}
                  onClick={() => {
                    setRenderId(null);
                    setAvatarId(avatar._id);
                  }}
                />
              ))}
              {wardrobeLooks.map((render) => (
                <LookCard
                  key={render._id}
                  label={render.outfitName}
                  src={render.url}
                  active={renderId === render._id}
                  onClick={() => setRenderId(render._id)}
                />
              ))}
            </div>
            {tryOns.status === "CanLoadMore" || tryOns.status === "LoadingMore" ? (
              <button
                type="button"
                className="h-10 rounded-full border border-hairline px-4 text-sm font-medium disabled:opacity-50"
                disabled={tryOns.status === "LoadingMore"}
                onClick={() => tryOns.loadMore(LOOK_PAGE)}
              >
                {tryOns.status === "LoadingMore" ? "Loading…" : "More looks"}
              </button>
            ) : null}
          </section>

          <div className="min-w-0 space-y-7">
            <GroomingPicker
              presentation={presentation}
              mode={serviceId}
              variant="references"
              keepPreviewUrl={keepPreviewUrl}
              hair={hairValue}
              beard={beardValue}
              custom={custom}
              hairStyles={orderedHair}
              onHair={setHair}
              onBeard={setBeard}
              onCustom={setCustom}
              disabled={pending}
            />

            {hqUnlocked && !selectedRender ? (
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
            <div className="hidden items-center justify-between gap-4 xl:flex">
              <CreditQuote quote={quote} label="preview" className="min-w-0" />
              <ApplyButton label={applyLabel} pending={pending} disabled={!canApply} onClick={() => void handleStart()} />
            </div>
          </div>
        </div>
      ) : (
        <>
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
            disabled={!canApply}
            onClick={() => void handleStart()}
            className="inline-flex h-12 items-center gap-2 rounded-full bg-ink px-8 text-base font-medium text-canvas disabled:opacity-50"
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            Start preview
          </button>
        </>
      )}

      <section className="min-w-0 space-y-4">
        <h2 className="text-sm font-medium">{isHairStudio ? "Your hairstyles" : "Recent looks"}</h2>
        {looks.status === "LoadingFirstPage" ? (
          <div className="h-40 animate-pulse bg-soft-cloud" />
        ) : looks.results.length === 0 ? (
          <p className="text-sm text-mute">No previews yet.</p>
        ) : (
          <ul className="grid min-w-0 grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
            {looks.results.map((render) => (
              <li key={render._id} className="space-y-2">
                <button
                  type="button"
                  className="block w-full aspect-[3/4] bg-soft-cloud text-left"
                  disabled={!render.url}
                  onClick={() => render.url && setLightbox(render.url)}
                >
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
                </button>
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

      {isHairStudio ? (
        <>
          <div className="h-28 xl:hidden" aria-hidden />
          <div
            className="fixed inset-x-0 z-20 border-t border-hairline bg-canvas px-4 pt-3 pb-3 xl:hidden"
            style={{ bottom: "var(--app-tab-height)" }}
          >
            <div className="mx-auto flex w-full max-w-lg flex-col gap-2">
              <CreditQuote quote={quote} label="preview" />
              <ApplyButton
                label={applyLabel}
                pending={pending}
                disabled={!canApply}
                onClick={() => void handleStart()}
                className="w-full"
              />
            </div>
          </div>
        </>
      ) : null}

      {lightbox ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-ink" role="dialog" aria-label="Hairstyle preview">
          <button
            type="button"
            aria-label="Close preview"
            className="absolute top-[max(0.75rem,env(safe-area-inset-top))] right-4 z-10 flex size-11 items-center justify-center rounded-full bg-canvas text-ink"
            onClick={() => setLightbox(null)}
          >
            <X className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            className="absolute inset-0"
            aria-label="Close preview"
            onClick={() => setLightbox(null)}
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox}
            alt=""
            className="relative z-10 m-auto max-h-full max-w-full object-contain"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      ) : null}

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

function LookCard({
  label,
  src,
  active,
  onClick,
}: {
  label: string;
  src: string | null;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className="w-[6.75rem] shrink-0 snap-start space-y-1 text-left sm:w-32 xl:w-full"
    >
      <div className={cn("aspect-[3/4] bg-soft-cloud", active && "ring-2 ring-ink ring-inset")}>
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className="h-full w-full object-cover" />
        ) : null}
      </div>
      <p className="truncate text-xs font-medium">{label}</p>
    </button>
  );
}

function ApplyButton({
  label,
  pending,
  disabled,
  onClick,
  className,
}: {
  label: string;
  pending: boolean;
  disabled: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-ink px-6 text-base font-medium text-canvas disabled:opacity-50 sm:px-8",
        className,
      )}
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : null}
      {label}
    </button>
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
