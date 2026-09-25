"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { Check, ChevronLeft, ImagePlus, Pause, Play } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  GARMENT_CARDS,
  PHONE_FRAME,
  TRY_ON_ASSETS,
  TRY_ON_LOOKS,
  TRY_ON_SOURCES,
  type TryOnAssetKey,
  type TryOnLookId,
} from "@/components/landing/try-on-assets";

const ASSET_LIST = [...new Set(TRY_ON_SOURCES)];

type CardId = (typeof GARMENT_CARDS)[number]["id"];

const CARD_FROM: Record<"wide" | "compact", Record<CardId, { xPercent: number; yPercent: number }>> = {
  wide: {
    shirt: { xPercent: 68, yPercent: 30 },
    trousers: { xPercent: -68, yPercent: 14 },
    shoes: { xPercent: 40, yPercent: -46 },
  },
  compact: {
    shirt: { xPercent: 32, yPercent: 16 },
    trousers: { xPercent: -32, yPercent: 8 },
    shoes: { xPercent: 18, yPercent: -20 },
  },
};

function GarmentMark({
  piece,
  label,
  className,
  labelClassName = "top-[8%] left-[8%]",
}: {
  piece: string;
  label: string;
  className: string;
  labelClassName?: string;
}) {
  return (
    <div
      data-tryon="outline"
      data-piece={piece}
      className={`pointer-events-none absolute opacity-0 ${className}`}
    >
      <span className="absolute top-0 left-0 h-[26%] w-[16%] border-t-2 border-l-2 border-ink" />
      <span className="absolute top-0 right-0 h-[26%] w-[16%] border-t-2 border-r-2 border-ink" />
      <span className="absolute bottom-0 left-0 h-[26%] w-[16%] border-b-2 border-l-2 border-ink" />
      <span className="absolute right-0 bottom-0 h-[26%] w-[16%] border-r-2 border-b-2 border-ink" />
      <span
        className={`absolute rounded-full bg-ink px-[0.5em] py-[0.2em] text-[clamp(7px,4cqw,10px)] leading-none font-medium text-canvas ${labelClassName}`}
      >
        {label}
      </span>
    </div>
  );
}

function loadAsset(src: string): Promise<boolean> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(true);
    image.onerror = () => resolve(false);
    image.src = src;
  });
}

function DemoImage({
  src,
  label,
  missing,
  width,
  height,
  className,
}: {
  src: string;
  label: string;
  missing: boolean;
  width: number;
  height: number;
  className: string;
}) {
  if (missing) {
    return (
      <div
        className={`flex items-center justify-center bg-soft-cloud px-1 text-center text-[10px] leading-tight font-medium text-mute ${className}`}
      >
        {label}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" width={width} height={height} className={className} />
  );
}

function createTimeline(compact: boolean) {
  const from = CARD_FROM[compact ? "compact" : "wide"];
  const easeOut = "power3.out";
  const easeInOut = "power2.inOut";
  const tl = gsap.timeline({
    repeat: -1,
    paused: true,
    defaults: { ease: easeOut },
  });

  const upload = "[data-tryon='upload']";
  const outfit = "[data-tryon='outfit']";
  const pointer = "[data-tryon='pointer']";
  const check = "[data-tryon='check']";
  const scan = "[data-tryon='scan']";
  const scanLabel = "[data-tryon='scan-label']";
  const outlines = "[data-tryon='outline']";
  const readyLabel = "[data-tryon='ready-label']";
  const creating = "[data-tryon='creating']";
  const shimmer = "[data-tryon='shimmer']";
  const shimmerBar = "[data-tryon='shimmer-bar']";
  const badge = "[data-tryon='badge']";

  const card = (id: CardId) => `[data-tryon='card'][data-card='${id}']`;
  const lookTarget = (look: TryOnLookId, name: string) =>
    `[data-look='${look}'][data-tryon='${name}']`;

  tl.set("[data-tryon='user']", { opacity: 0, scale: 0.98, xPercent: 0, yPercent: 0, transformOrigin: "50% 50%" }, 0);
  tl.set("[data-tryon='after']", { opacity: 0, clipPath: "inset(0% 100% 0% 0%)" }, 0);
  tl.set("[data-tryon='thumb']", { opacity: 0 }, 0);
  tl.set("[data-tryon='outfit-photo']", { opacity: 0, scale: 0.96, transformOrigin: "50% 50%" }, 0);
  tl.set("[data-tryon='piece-photo']", { opacity: 0 }, 0);
  tl.set("[data-tryon='compare']", { opacity: 0 }, 0);
  tl.set(upload, { opacity: 1 }, 0);
  tl.set(outfit, { opacity: 0, yPercent: 8 }, 0);
  tl.set(pointer, { opacity: 1, scale: 1, xPercent: -50, yPercent: -50, top: "91%", left: "50%" }, 0);
  tl.set(check, { opacity: 0, scale: 0.6, transformOrigin: "50% 50%" }, 0);
  tl.set(scan, { opacity: 0, yPercent: -110 }, 0);
  tl.set(scanLabel, { opacity: 0 }, 0);
  tl.set(outlines, { opacity: 0 }, 0);
  tl.set(readyLabel, { opacity: 0 }, 0);
  tl.set(creating, { opacity: 0 }, 0);
  tl.set(shimmer, { opacity: 0 }, 0);
  tl.set(shimmerBar, { xPercent: -130 }, 0);
  tl.set(badge, { opacity: 0 }, 0);
  tl.set("[data-tryon='pieces']", { opacity: 0, yPercent: 18 }, 0);
  tl.set("[data-tryon='piece']", { opacity: 0, yPercent: 14 }, 0);
  tl.set(card("shirt"), { opacity: 0, scale: 0.86, ...from.shirt, transformOrigin: "50% 50%" }, 0);
  tl.set(card("trousers"), { opacity: 0, scale: 0.86, ...from.trousers, transformOrigin: "50% 50%" }, 0);
  tl.set(card("shoes"), { opacity: 0, scale: 0.86, ...from.shoes, transformOrigin: "50% 50%" }, 0);

  function addCycle(look: TryOnLookId, at: number) {
    const other: TryOnLookId = look === "female" ? "male" : "female";
    const user = lookTarget(look, "user");
    const after = lookTarget(look, "after");
    const outfitPhoto = lookTarget(look, "outfit-photo");
    const thumb = lookTarget(look, "thumb");
    const compare = lookTarget(look, "compare");
    const piecePhoto = lookTarget(look, "piece-photo");
    const uploadUser = at;
    const uploadOutfit = at + 3;
    const extract = at + 6;
    const apply = at + 10;
    const result = at + 13.5;
    const reset = at + 17;

    tl.set(lookTarget(other, "user"), { opacity: 0 }, at);
    tl.set(lookTarget(other, "after"), { opacity: 0 }, at);
    tl.set(lookTarget(other, "thumb"), { opacity: 0 }, at);
    tl.set(lookTarget(other, "outfit-photo"), { opacity: 0 }, at);
    tl.set(lookTarget(other, "piece-photo"), { opacity: 0 }, at);
    tl.set(lookTarget(other, "compare"), { opacity: 0 }, at);

    tl.to(pointer, { scale: 0.82, duration: 0.16, ease: easeInOut, yoyo: true, repeat: 1 }, uploadUser + 0.45);
    tl.to(upload, { opacity: 0, duration: 0.5 }, uploadUser + 0.7);
    tl.to(user, { opacity: 1, scale: 1, duration: 0.7 }, uploadUser + 0.7);
    tl.to(pointer, { opacity: 0, duration: 0.35 }, uploadUser + 1.15);
    tl.to(check, { opacity: 1, scale: 1, duration: 0.45 }, uploadUser + 1.45);

    tl.to(check, { opacity: 0, scale: 0.8, duration: 0.25 }, uploadOutfit);
    tl.to(user, { opacity: 0, duration: 0.35 }, uploadOutfit + 0.2);
    tl.to(outfit, { opacity: 1, yPercent: 0, duration: 0.6, ease: easeInOut }, uploadOutfit + 0.15);
    tl.to(thumb, { opacity: 1, duration: 0.4 }, uploadOutfit + 0.15);
    tl.to(pointer, { opacity: 1, top: "91%", duration: 0.4, ease: easeInOut }, uploadOutfit + 0.55);
    tl.to(pointer, { scale: 0.82, duration: 0.16, ease: easeInOut, yoyo: true, repeat: 1 }, uploadOutfit + 1.05);
    tl.to(outfitPhoto, { opacity: 1, scale: 1, duration: 0.6 }, uploadOutfit + 1.2);
    tl.to(pointer, { opacity: 0, duration: 0.25 }, uploadOutfit + 1.4);

    tl.to(scanLabel, { opacity: 1, duration: 0.25 }, extract);
    tl.to(scan, { opacity: 1, duration: 0.2 }, extract);
    tl.to(scan, { yPercent: 640, duration: 1.45, ease: "none" }, extract);
    tl.to([scan, scanLabel], { opacity: 0, duration: 0.28 }, extract + 1.28);
    tl.to(`${outlines}[data-piece='shirt']`, { opacity: 1, duration: 0.35 }, extract + 0.72);
    tl.to(`${outlines}[data-piece='trousers']`, { opacity: 1, duration: 0.35 }, extract + 0.98);
    tl.to(`${outlines}[data-piece='shoes']`, { opacity: 1, duration: 0.35 }, extract + 1.24);
    tl.to(outlines, { opacity: 0, duration: 0.28 }, extract + 1.62);
    tl.to(card("shirt"), { opacity: 1, scale: 1, xPercent: 0, yPercent: 0, duration: 0.7 }, extract + 1.7);
    tl.to(card("trousers"), { opacity: 1, scale: 1, xPercent: 0, yPercent: 0, duration: 0.7 }, extract + 1.88);
    tl.to(card("shoes"), { opacity: 1, scale: 1, xPercent: 0, yPercent: 0, duration: 0.7 }, extract + 2.06);
    tl.to(readyLabel, { opacity: 1, duration: 0.45 }, extract + 2.35);
    tl.to("[data-tryon='pieces']", { opacity: 1, yPercent: 0, duration: 0.5 }, extract + 1.65);
    tl.to("[data-tryon='piece']", { opacity: 1, yPercent: 0, duration: 0.4, stagger: 0.12 }, extract + 1.8);
    tl.to(piecePhoto, { opacity: 1, duration: 0.35 }, extract + 1.65);

    tl.to(readyLabel, { opacity: 0, duration: 0.25 }, apply);
    tl.to("[data-tryon='pieces']", { opacity: 0, yPercent: 16, duration: 0.28 }, apply);
    tl.to("[data-tryon='piece']", { opacity: 0, duration: 0.15 }, apply);
    tl.to(piecePhoto, { opacity: 0, duration: 0.15 }, apply);
    tl.to(outfit, { opacity: 0, duration: 0.28 }, apply);
    tl.to(thumb, { opacity: 0, duration: 0.2 }, apply);
    tl.to(user, { opacity: 1, duration: 0.4 }, apply + 0.32);
    tl.to(card("shirt"), { ...from.shirt, opacity: 0, scale: 0.84, duration: 0.65, ease: easeInOut }, apply + 0.4);
    tl.to(card("trousers"), { ...from.trousers, opacity: 0, scale: 0.84, duration: 0.65, ease: easeInOut }, apply + 0.55);
    tl.to(card("shoes"), { ...from.shoes, opacity: 0, scale: 0.84, duration: 0.65, ease: easeInOut }, apply + 0.7);
    tl.to(creating, { opacity: 1, duration: 0.4 }, apply + 0.45);
    tl.to(shimmer, { opacity: 1, duration: 0.35 }, apply + 0.5);
    tl.to(shimmerBar, { xPercent: 160, duration: 1.15, ease: easeInOut }, apply + 0.5);
    tl.set(after, { opacity: 1 }, apply + 1.55);
    tl.to(after, { clipPath: "inset(0% 0% 0% 0%)", duration: 0.8, ease: easeInOut }, apply + 1.55);
    tl.to(user, { opacity: 0, duration: 0.4 }, apply + 2.15);
    tl.to(shimmer, { opacity: 0, duration: 0.35 }, apply + 2.35);
    tl.to(creating, { opacity: 0, duration: 0.3 }, apply + 2.5);

    tl.to(badge, { opacity: 1, duration: 0.5 }, result);
    tl.to(compare, { opacity: 1, duration: 0.5 }, result + 0.2);

    tl.to([badge, compare, after], { opacity: 0, duration: 0.35, ease: easeInOut }, reset);
    tl.to(upload, { opacity: 1, duration: 0.4, ease: easeInOut }, reset + 0.4);
    tl.set(user, { opacity: 0, scale: 0.98, xPercent: 0, yPercent: 0 }, reset + 0.6);
    tl.set(after, { opacity: 0, clipPath: "inset(0% 100% 0% 0%)" }, reset + 0.6);
    tl.set(outfit, { opacity: 0, yPercent: 8 }, reset + 0.6);
    tl.set(outfitPhoto, { opacity: 0, scale: 0.96 }, reset + 0.6);
    tl.set(thumb, { opacity: 0 }, reset + 0.6);
    tl.set(pointer, { opacity: 1, scale: 1, top: "91%", xPercent: -50, yPercent: -50 }, reset + 0.6);
    tl.set(check, { opacity: 0, scale: 0.6 }, reset + 0.6);
    tl.set(scan, { opacity: 0, yPercent: -110 }, reset + 0.6);
    tl.set(scanLabel, { opacity: 0 }, reset + 0.6);
    tl.set(outlines, { opacity: 0 }, reset + 0.6);
    tl.set(readyLabel, { opacity: 0 }, reset + 0.6);
    tl.set(creating, { opacity: 0 }, reset + 0.6);
    tl.set(shimmer, { opacity: 0 }, reset + 0.6);
    tl.set(shimmerBar, { xPercent: -130 }, reset + 0.6);
    tl.set(badge, { opacity: 0 }, reset + 0.6);
    tl.set(compare, { opacity: 0 }, reset + 0.6);
    tl.set(piecePhoto, { opacity: 0 }, reset + 0.6);
    tl.set(card("shirt"), { opacity: 0, scale: 0.86, ...from.shirt }, reset + 0.6);
    tl.set(card("trousers"), { opacity: 0, scale: 0.86, ...from.trousers }, reset + 0.6);
    tl.set(card("shoes"), { opacity: 0, scale: 0.86, ...from.shoes }, reset + 0.6);
    tl.set("[data-tryon='pieces']", { opacity: 0, yPercent: 18 }, reset + 0.6);
    tl.set("[data-tryon='piece']", { opacity: 0, yPercent: 14 }, reset + 0.6);
  }

  addCycle("female", 0);
  addCycle("male", 18);
  tl.set({}, {}, 36);

  return tl;
}


function showStill() {
  gsap.set("[data-tryon='upload']", { opacity: 0 });
  gsap.set("[data-tryon='user']", { opacity: 0 });
  gsap.set("[data-tryon='outfit']", { opacity: 0 });
  gsap.set("[data-tryon='pointer']", { opacity: 0 });
  gsap.set("[data-tryon='check']", { opacity: 0 });
  gsap.set("[data-tryon='scan']", { opacity: 0 });
  gsap.set("[data-tryon='scan-label']", { opacity: 0 });
  gsap.set("[data-tryon='outline']", { opacity: 0 });
  gsap.set("[data-tryon='ready-label']", { opacity: 0 });
  gsap.set("[data-tryon='creating']", { opacity: 0 });
  gsap.set("[data-tryon='shimmer']", { opacity: 0 });
  gsap.set("[data-tryon='thumb']", { opacity: 0 });
  gsap.set("[data-tryon='outfit-photo']", { opacity: 0 });
  gsap.set("[data-tryon='piece-photo']", { opacity: 0 });
  gsap.set("[data-look='male'][data-tryon='after']", { opacity: 0 });
  gsap.set("[data-look='male'][data-tryon='compare']", { opacity: 0 });
  gsap.set("[data-look='female'][data-tryon='after']", { opacity: 1, clipPath: "inset(0% 0% 0% 0%)" });
  gsap.set("[data-tryon='badge']", { opacity: 1 });
  gsap.set("[data-look='female'][data-tryon='compare']", { opacity: 1 });
  gsap.set("[data-tryon='card']", { opacity: 1, xPercent: 0, yPercent: 0, scale: 1 });
  gsap.set("[data-tryon='pieces']", { opacity: 0 });
  gsap.set("[data-tryon='piece']", { opacity: 0, yPercent: 0 });
}

const screenStyle = {
  top: `${PHONE_FRAME.screen.top}%`,
  left: `${PHONE_FRAME.screen.left}%`,
  width: `${PHONE_FRAME.screen.width}%`,
  height: `${PHONE_FRAME.screen.height}%`,
  borderRadius: `${PHONE_FRAME.screen.radiusX}% / ${PHONE_FRAME.screen.radiusY}%`,
};

export function FashionTryOnHero() {
  const rootRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const pausedByUser = useRef(false);
  const visibleRef = useRef(true);
  const [paused, setPaused] = useState(false);
  const [ready, setReady] = useState(false);
  const [missing, setMissing] = useState<ReadonlySet<string>>(new Set());

  const syncPlayback = useCallback(() => {
    const timeline = timelineRef.current;
    if (!timeline) return;
    const shouldPlay =
      visibleRef.current && document.visibilityState === "visible" && !pausedByUser.current;
    if (shouldPlay) timeline.play();
    else timeline.pause();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void Promise.all(ASSET_LIST.map(async (src) => ({ src, ok: await loadAsset(src) }))).then(
      (results) => {
        if (cancelled) return;
        setMissing(new Set(results.filter((result) => !result.ok).map((result) => result.src)));
        setReady(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  useGSAP(
    () => {
      if (!ready) return;
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: reduce)", () => {
        timelineRef.current = null;
        showStill();
      });
      mm.add("(prefers-reduced-motion: no-preference) and (max-width: 639px)", () => {
        const timeline = createTimeline(true);
        timelineRef.current = timeline;
        syncPlayback();
        return () => {
          timeline.kill();
          if (timelineRef.current === timeline) timelineRef.current = null;
        };
      });
      mm.add("(prefers-reduced-motion: no-preference) and (min-width: 640px)", () => {
        const timeline = createTimeline(false);
        timelineRef.current = timeline;
        syncPlayback();
        return () => {
          timeline.kill();
          if (timelineRef.current === timeline) timelineRef.current = null;
        };
      });
      return () => mm.revert();
    },
    { scope: rootRef, dependencies: [ready, syncPlayback], revertOnUpdate: true },
  );

  useEffect(() => {
    if (!ready) return;
    const node = rootRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        visibleRef.current = entry?.isIntersecting ?? false;
        syncPlayback();
      },
      { threshold: 0.2 },
    );
    observer.observe(node);

    const onVisibility = () => syncPlayback();
    document.addEventListener("visibilitychange", onVisibility);
    syncPlayback();

    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [ready, syncPlayback]);

  function togglePlayback() {
    pausedByUser.current = !pausedByUser.current;
    setPaused(pausedByUser.current);
    syncPlayback();
  }

  const isMissing = (key: TryOnAssetKey) => missing.has(TRY_ON_ASSETS[key]);

  return (
    <div className="relative mx-auto w-auto min-w-0">
      <p className="sr-only">
        Demonstration of a virtual try-on for a woman, then a man. A photo is added, an outfit is
        chosen, the shirt, trousers, and shoes are separated, and that same person appears wearing
        the outfit.
      </p>
      <div className="relative h-[52dvh] max-h-[420px] w-auto sm:h-[56dvh] sm:max-h-[460px] lg:h-[480px] lg:max-h-none">
        <div className="tryon-waves" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div
          ref={rootRef}
          aria-hidden="true"
          className="@container relative z-10 aspect-[820/1680] h-full w-auto overflow-hidden select-none"
        >
        {GARMENT_CARDS.map((card) => (
          <div
            key={card.id}
            data-tryon="card"
            data-card={card.id}
            className={`absolute z-20 hidden rounded-2xl border border-hairline bg-canvas p-[3%] opacity-0 ${card.className}`}
          >
            <DemoImage
              src={card.src}
              label={card.label}
              missing={isMissing(card.id)}
              width={card.width}
              height={card.height}
              className="aspect-square w-full object-contain"
            />
            <p className="mt-[6%] text-center text-[clamp(9px,2.4cqi,12px)] font-medium text-ink">
              {card.label}
            </p>
          </div>
        ))}

        <div
          className="absolute top-1/2 left-1/2 w-[113.66%] -translate-x-1/2 -translate-y-1/2"
          style={{ aspectRatio: `${PHONE_FRAME.width} / ${PHONE_FRAME.height}` }}
        >
          <div className="@container absolute z-0 flex flex-col overflow-hidden bg-soft-cloud text-ink" style={screenStyle}>
            <div className="flex h-[8%] shrink-0 items-end justify-between px-[7%] pb-[1%] text-[clamp(8px,4.6cqw,10px)] leading-none font-semibold">
              <span>9:41</span>
              <span className="flex items-center gap-[0.35em]">
                <svg viewBox="0 0 18 12" className="h-[0.7em] w-[1.05em]" aria-hidden="true">
                  <rect x="0" y="7" width="3" height="5" rx="0.6" fill="currentColor" />
                  <rect x="5" y="4" width="3" height="8" rx="0.6" fill="currentColor" />
                  <rect x="10" y="1.5" width="3" height="10.5" rx="0.6" fill="currentColor" />
                  <rect x="15" y="0" width="3" height="12" rx="0.6" fill="currentColor" opacity="0.35" />
                </svg>
                <svg viewBox="0 0 25 12" className="h-[0.7em] w-[1.35em]" aria-hidden="true">
                  <rect x="0.5" y="0.5" width="21" height="11" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
                  <rect x="2" y="2" width="15" height="8" rx="1.2" fill="currentColor" />
                  <rect x="22.5" y="3.5" width="1.6" height="5" rx="0.6" fill="currentColor" />
                </svg>
              </span>
            </div>
            <div className="flex h-[7.5%] shrink-0 items-center border-b border-hairline px-[4%]">
              <ChevronLeft className="size-[1.15em] shrink-0" strokeWidth={2.25} />
              <p className="flex-1 text-center font-display text-[clamp(12px,7cqw,15px)] leading-none font-medium tracking-[0.14em] uppercase">
                WardrobeAI
              </p>
              <span className="size-[1.15em] shrink-0" />
            </div>

            <div className="relative min-h-0 flex-1 overflow-hidden">
              {TRY_ON_LOOKS.map((look) => (
                <div
                  key={`${look.id}-user`}
                  data-look={look.id}
                  data-tryon="user"
                  className="absolute inset-0 z-[1] opacity-0"
                >
                  <DemoImage
                    src={look.userBefore}
                    label="Your photo"
                    missing={missing.has(look.userBefore)}
                    width={look.userSize.width}
                    height={look.userSize.height}
                    className="h-full w-full object-cover"
                  />
                </div>
              ))}
              {TRY_ON_LOOKS.map((look) => (
                <div
                  key={`${look.id}-after`}
                  data-look={look.id}
                  data-tryon="after"
                  className={`absolute inset-0 z-[2] opacity-0${look.id === "female" ? " motion-reduce:opacity-100" : ""}`}
                >
                  <DemoImage
                    src={look.userAfter}
                    label="Your look"
                    missing={missing.has(look.userAfter)}
                    width={look.afterSize.width}
                    height={look.afterSize.height}
                    className="h-full w-full object-cover"
                  />
                </div>
              ))}

              <div
                data-tryon="upload"
                className="absolute inset-0 z-[3] flex flex-col bg-soft-cloud px-[5%] pt-[2%] pb-[4%] motion-reduce:opacity-0"
              >
                <p className="text-[clamp(12px,7cqw,15px)] leading-tight font-semibold tracking-tight">
                  Add your photo
                </p>
                <p className="mt-[2%] text-[clamp(9px,4.6cqw,11px)] leading-snug text-mute">
                  Full body, head to shoes.
                </p>
                <div className="mt-[4%] flex min-h-0 flex-1 flex-col items-center justify-center rounded-[1.25rem] border border-dashed border-hairline bg-canvas">
                  <span className="flex size-[22%] max-h-14 min-h-8 max-w-14 min-w-8 items-center justify-center rounded-full bg-soft-cloud">
                    <ImagePlus className="size-[46%]" strokeWidth={1.75} />
                  </span>
                  <p className="mt-[5%] text-[clamp(10px,5.4cqw,12px)] font-medium">Choose a photo</p>
                  <p className="mt-[1.5%] text-[clamp(8px,4.2cqw,10px)] text-mute">Camera roll</p>
                </div>
                <div className="mt-[4%] flex h-8 max-h-8 min-h-7 shrink-0 items-center justify-center rounded-full bg-ink text-[clamp(11px,5.4cqw,13px)] font-medium text-canvas">
                  Upload
                </div>
              </div>

              <div
                data-tryon="check"
                className="absolute bottom-[6%] left-1/2 z-[4] flex -translate-x-1/2 items-center gap-[0.4em] rounded-full bg-ink px-[0.8em] py-[0.4em] text-[clamp(9px,5.8cqw,12px)] font-medium text-canvas opacity-0"
              >
                <Check className="size-[1em]" strokeWidth={2.75} />
                Photo added
              </div>

              <div
                data-tryon="outfit"
                className="absolute inset-0 z-[3] flex flex-col bg-soft-cloud px-[4%] pt-[3%] pb-[3%] opacity-0"
              >
                <div className="flex shrink-0 items-center gap-[3%] rounded-xl border border-hairline bg-canvas px-[2.5%] py-[2%]">
                  <div className="relative h-[11cqw] w-[8.6cqw] shrink-0 overflow-hidden rounded-md">
                    {TRY_ON_LOOKS.map((look) => (
                      <div
                        key={look.id}
                        data-look={look.id}
                        data-tryon="thumb"
                        className="absolute inset-0 opacity-0"
                      >
                        <DemoImage
                          src={look.userBefore}
                          label="You"
                          missing={missing.has(look.userBefore)}
                          width={look.userSize.width}
                          height={look.userSize.height}
                          className="h-full w-full object-cover"
                        />
                      </div>
                    ))}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[clamp(10px,5cqw,12px)] leading-tight font-semibold">
                      Your photo
                    </p>
                    <p className="mt-[2%] text-[clamp(8px,4cqw,10px)] leading-none text-mute">Ready to style</p>
                  </div>
                  <span className="flex size-[6.5cqw] max-h-5 min-h-4 max-w-5 min-w-4 shrink-0 items-center justify-center rounded-full bg-ink text-canvas">
                    <Check className="size-[55%]" strokeWidth={3} />
                  </span>
                </div>
                <div className="relative mt-[3%] flex items-center pr-[28%]">
                  <p className="text-[clamp(11px,6cqw,13px)] leading-tight font-semibold">
                    Outfit inspiration
                  </p>
                  <p
                    data-tryon="scan-label"
                    className="absolute top-1/2 right-0 inline-flex -translate-y-1/2 items-center gap-[0.35em] rounded-full bg-canvas px-[0.45em] py-[0.18em] text-[clamp(8px,3.8cqw,10px)] leading-none font-medium opacity-0"
                  >
                    <span className="size-[0.4em] rounded-full bg-ink" />
                    Scanning
                  </p>
                </div>
                <p className="mt-[1%] text-[clamp(8px,4.2cqw,10px)] leading-none text-mute">
                  Shirt, trousers, and shoes.
                </p>
                <div className="mt-[2%] flex w-full min-h-0 flex-1 items-center justify-center">
                  <div className="relative aspect-[3/4] h-full w-full max-h-full max-w-full overflow-hidden rounded-[0.85rem] bg-canvas">
                    {TRY_ON_LOOKS.map((look) => (
                      <div
                        key={look.id}
                        data-look={look.id}
                        data-tryon="outfit-photo"
                        className="absolute inset-0 opacity-0"
                      >
                        <DemoImage
                          src={look.outfit}
                          label="Outfit"
                          missing={missing.has(look.outfit)}
                          width={look.outfitSize.width}
                          height={look.outfitSize.height}
                          className="h-full w-full object-contain"
                        />
                      </div>
                    ))}
                    <div
                      data-tryon="scan"
                      className="pointer-events-none absolute inset-x-[8%] top-0 z-[1] h-[12%] opacity-0"
                    >
                      <div className="absolute inset-0 bg-gradient-to-b from-transparent to-ink/10" />
                      <div className="absolute inset-x-0 bottom-0 h-px bg-ink/70" />
                    </div>
                    <GarmentMark
                      piece="shirt"
                      label="Shirt"
                      className="top-[2%] left-[24%] h-[33%] w-[50%]"
                      labelClassName="top-[6%] right-[6%]"
                    />
                    <GarmentMark
                      piece="trousers"
                      label="Trousers"
                      className="top-[37%] left-[32%] h-[41%] w-[34%]"
                      labelClassName="top-[12%] left-[8%]"
                    />
                    <GarmentMark
                      piece="shoes"
                      label="Shoes"
                      className="top-[81%] left-[36%] h-[15%] w-[26%]"
                      labelClassName="top-[18%] left-1/2 -translate-x-1/2"
                    />
                  </div>
                </div>
                <div className="mt-[3%] flex h-8 max-h-8 min-h-7 shrink-0 items-center justify-center rounded-full bg-ink text-[clamp(11px,5.4cqw,13px)] font-medium text-canvas">
                  Use this outfit
                </div>
              </div>

              <div
                data-tryon="pieces"
                className="absolute inset-x-[5%] bottom-[9%] z-[4] max-h-[42%] overflow-hidden rounded-xl border border-hairline bg-canvas p-[3%] opacity-0 shadow-[0_8px_18px_rgba(17,17,17,0.12)]"
              >
                <div className="flex items-baseline justify-between gap-[4%]">
                  <p className="text-[clamp(9px,4.8cqw,11px)] font-semibold">Select pieces</p>
                  <p className="text-[clamp(8px,3.6cqw,10px)] font-medium text-mute">3 found</p>
                </div>
                <div className="mt-[2.5%] flex gap-[2%]">
                  {GARMENT_CARDS.map((card) => (
                    <div
                      key={card.id}
                      data-tryon="piece"
                      className="relative flex w-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg bg-soft-cloud p-[5%] opacity-0 ring-1 ring-ink/10"
                    >
                      <span className="absolute top-[5%] right-[5%] z-[1] flex size-[3.6cqw] items-center justify-center rounded-full bg-ink text-canvas">
                        <Check className="size-[60%]" strokeWidth={3} />
                      </span>
                      <div className="relative aspect-square max-h-12 w-full">
                        {TRY_ON_LOOKS.map((look) => {
                          const piece = look.pieces.find((item) => item.id === card.id);
                          if (!piece) return null;
                          return (
                            <div
                              key={look.id}
                              data-look={look.id}
                              data-tryon="piece-photo"
                              className="absolute inset-0 opacity-0"
                            >
                              <DemoImage
                                src={piece.src}
                                label={piece.label}
                                missing={missing.has(piece.src)}
                                width={piece.width}
                                height={piece.height}
                                className="h-full w-full object-contain"
                              />
                            </div>
                          );
                        })}
                      </div>
                      <p className="mt-[6%] text-center text-[clamp(8px,3.6cqw,10px)] leading-none font-medium">
                        {card.label}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div
                data-tryon="shimmer"
                className="pointer-events-none absolute inset-0 z-[5] overflow-hidden opacity-0"
              >
                <div
                  data-tryon="shimmer-bar"
                  className="absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-white/75 to-transparent"
                />
              </div>

              <p data-tryon="creating" className="absolute inset-x-[8%] top-[40%] z-[6] text-center opacity-0">
                <span className="inline-flex flex-col items-center rounded-2xl bg-canvas px-[0.9em] py-[0.7em] shadow-[0_10px_24px_rgba(17,17,17,0.12)]">
                  <span className="text-[clamp(11px,6.8cqw,14px)] font-semibold">Creating your look</span>
                  <span className="mt-[0.25em] text-[clamp(9px,5.2cqw,12px)] font-medium text-mute">
                    Matching the outfit
                  </span>
                </span>
              </p>
              <p data-tryon="ready-label" className="absolute inset-x-[8%] bottom-[28%] z-[6] hidden text-center opacity-0">
                <span className="inline-flex items-center gap-[0.35em] rounded-full bg-canvas px-[0.75em] py-[0.4em] text-[clamp(10px,6cqw,13px)] font-semibold shadow-[0_8px_18px_rgba(17,17,17,0.1)]">
                  <Check className="size-[1em]" strokeWidth={2.75} />
                  Outfit ready
                </span>
              </p>
              <div className="absolute inset-x-0 bottom-0 z-[6]">
                <div
                  data-tryon="badge"
                  className="rounded-t-[1.35rem] bg-canvas px-[6%] pt-[3.5%] pb-[6%] text-center opacity-0 shadow-[0_-10px_28px_rgba(17,17,17,0.14)] motion-reduce:opacity-100"
                >
                  <span className="mx-auto mb-[4%] block h-[3px] w-[16%] rounded-full bg-hairline" />
                  <p className="text-[clamp(12px,7cqw,15px)] font-semibold">Your look is ready</p>
                  <div className="relative mt-[4%]">
                    {TRY_ON_LOOKS.map((look) => (
                      <div
                        key={look.id}
                        data-look={look.id}
                        data-tryon="compare"
                        className={`${look.id === "female" ? "relative motion-reduce:opacity-100" : "absolute inset-0"} flex items-end justify-center gap-[8%] opacity-0`}
                      >
                        <figure className="w-[28%]">
                          <DemoImage
                            src={look.userBefore}
                            label="Before"
                            missing={missing.has(look.userBefore)}
                            width={look.userSize.width}
                            height={look.userSize.height}
                            className="aspect-[3/4] w-full rounded-lg object-cover"
                          />
                          <figcaption className="mt-0.5 text-center text-[clamp(8px,4.8cqw,11px)] font-medium text-mute">
                            Before
                          </figcaption>
                        </figure>
                        <figure className="w-[28%]">
                          <DemoImage
                            src={look.userAfter}
                            label="After"
                            missing={missing.has(look.userAfter)}
                            width={look.afterSize.width}
                            height={look.afterSize.height}
                            className="aspect-[3/4] w-full rounded-lg object-cover ring-2 ring-ink"
                          />
                          <figcaption className="mt-0.5 text-center text-[clamp(8px,4.8cqw,11px)] font-medium">
                            After
                          </figcaption>
                        </figure>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div
                data-tryon="pointer"
                className="absolute top-[91%] left-1/2 z-[7] size-[5cqw] min-h-2.5 min-w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-canvas shadow-[0_0_0_1px_rgba(17,17,17,0.35),0_0_0_7px_rgba(17,17,17,0.12)] motion-reduce:opacity-0"
              />
            </div>

            <div className="flex h-[4.2%] shrink-0 items-center justify-center">
              <span className="h-[3px] w-[34%] rounded-full bg-ink" />
            </div>
          </div>

          {missing.has(TRY_ON_ASSETS.phoneFrame) ? (
            <div className="pointer-events-none absolute inset-[4%] z-10 rounded-[18%] border-[6px] border-ink" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={TRY_ON_ASSETS.phoneFrame}
              alt=""
              width={PHONE_FRAME.width}
              height={PHONE_FRAME.height}
              className="pointer-events-none absolute inset-0 z-10 h-full w-full drop-shadow-[0_16px_28px_rgba(17,17,17,0.16)]"
            />
          )}
        </div>
      </div>
      </div>

      <button
        type="button"
        aria-pressed={paused}
        aria-label={paused ? "Play demonstration" : "Pause demonstration"}
        onClick={togglePlayback}
        className="relative z-30 mt-3 mr-4 ml-auto flex size-10 items-center justify-center rounded-full bg-soft-cloud text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-reduce:hidden lg:absolute lg:-right-12 lg:bottom-1 lg:mt-0 lg:mr-0"
      >
        {paused ? <Play className="size-4" aria-hidden="true" /> : <Pause className="size-4" aria-hidden="true" />}
      </button>
    </div>
  );
}
