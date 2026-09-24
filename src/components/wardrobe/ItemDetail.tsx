"use client";

import { useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  CalendarCheck,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  Trash2,
  Wand2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { shopSimilarVisible } from "@convex/shared/shop";
import { CATEGORY_LABELS } from "@convex/shared/wardrobe";
import { CreditQuote, useCreditQuote } from "@/components/common/CreditQuote";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { ItemImage } from "@/components/common/ItemImage";
import { JobStepper } from "@/components/common/JobStepper";
import { AppHeaderTitle } from "@/components/layout/app-header";
import { ItemForm } from "@/components/wardrobe/ItemForm";
import { ShopSimilar } from "@/components/wardrobe/ShopSimilar";
import { reportError } from "@/lib/client-errors";
import { formatDate, formatRelative } from "@/lib/format";
import { routes } from "@/lib/routes";

export function ItemDetail({ itemId }: { itemId: string }) {
  const data = useQuery(api.items.get, { itemId });
  const me = useQuery(api.users.me);
  const router = useRouter();
  const dismissDuplicate = useMutation(api.items.dismissDuplicate);
  const markWorn = useMutation(api.items.markWorn);
  const setStatus = useMutation(api.items.setStatus);
  const reextract = useMutation(api.items.reextract);
  const removeItems = useMutation(api.items.remove);

  const [dismissing, setDismissing] = useState(false);
  const [pending, setPending] = useState<"worn" | "status" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmReextract, setConfirmReextract] = useState(false);
  const [jobId, setJobId] = useState<Id<"jobs"> | null>(null);
  const job = useQuery(api.jobs.get, jobId ? { jobId } : "skip");
  const quote = useCreditQuote(
    data?.item.uploadId ? { kind: "extract", items: 1 } : null,
  );

  if (data === undefined) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-32 animate-pulse bg-soft-cloud" />
        <div className="aspect-square max-w-md animate-pulse bg-soft-cloud" />
      </div>
    );
  }

  if (data === null) {
    return (
      <div className="space-y-4">
        <BackLink />
        <h1 className="font-display text-4xl uppercase tracking-tight">
          Item not found
        </h1>
        <p className="text-mute">It may have been deleted.</p>
        <Link
          href={routes.wardrobe}
          className="inline-flex h-12 items-center rounded-full bg-ink px-8 text-base font-medium text-canvas"
        >
          Back to wardrobe
        </Link>
      </div>
    );
  }

  const { item, outfits, sourceUrl, duplicateOf } = data;
  const hidden = item.status === "hidden";

  async function handleKeepBoth() {
    setDismissing(true);
    try {
      await dismissDuplicate({ itemId: item._id });
      toast.success("Kept as a separate item.");
    } catch (error) {
      toast.error(reportError(error).message);
    } finally {
      setDismissing(false);
    }
  }

  async function markWornToday() {
    setPending("worn");
    try {
      await markWorn({ itemId: item._id });
      toast.success("Marked as worn today.");
    } catch (e) {
      toast.error(reportError(e).message);
    } finally {
      setPending(null);
    }
  }

  async function toggleHidden() {
    setPending("status");
    try {
      await setStatus({
        itemIds: [item._id],
        status: hidden ? "ready" : "hidden",
      });
      toast.success(hidden ? "Back in your wardrobe." : "Hidden from the grid.");
    } catch (e) {
      toast.error(reportError(e).message);
    } finally {
      setPending(null);
    }
  }

  async function runReextract() {
    const result = await reextract({ itemId: item._id });
    setJobId(result.jobId);
    toast.success("Re-extraction started.");
  }

  async function deleteItem() {
    await removeItems({ itemIds: [item._id] });
    toast.success("Item deleted.");
    router.push(routes.wardrobe);
  }

  return (
    <div className="space-y-6">
      <AppHeaderTitle title={item.name} />
      <BackLink />

      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-mute">
          {CATEGORY_LABELS[item.category]}
        </p>
        <h1 className="mt-1 font-display text-3xl font-medium uppercase leading-[0.9] tracking-tight sm:mt-2 sm:text-5xl">
          {item.name}
        </h1>
        <p className="mt-3 text-base text-mute">
          {[item.subcategory, item.colours.primary, item.material]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {hidden ? (
          <span className="mt-3 inline-block rounded-full border border-hairline px-3 py-1 text-xs font-medium">
            Hidden
          </span>
        ) : null}
      </div>

      {duplicateOf ? (
        <div className="flex flex-col gap-3 border border-hairline bg-soft-cloud p-4 sm:flex-row sm:items-center">
          <ItemImage
            src={duplicateOf.url}
            alt={duplicateOf.name}
            aspect="aspect-square"
            className="size-14 shrink-0 p-1.5"
          />
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <Copy className="size-4 shrink-0" aria-hidden />
              Possible duplicate
            </p>
            <p className="text-sm text-mute">
              Looks a lot like{" "}
              <Link
                href={routes.item(duplicateOf._id)}
                className="font-medium text-ink underline underline-offset-4"
              >
                {duplicateOf.name}
              </Link>
              .
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleKeepBoth()}
            disabled={dismissing}
            className="h-10 shrink-0 rounded-full border border-hairline bg-canvas px-4 text-sm font-medium disabled:opacity-50"
          >
            {dismissing ? <Loader2 className="size-4 animate-spin" /> : "Keep both"}
          </button>
        </div>
      ) : null}

      <div className="grid gap-8 border-t border-hairline pt-7 lg:grid-cols-2 lg:gap-14">
        <div className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <ItemImage
            src={item.url}
            alt={item.name}
            aspect="aspect-square"
            className="p-4 sm:p-14"
            priority
          />

          <div className="flex gap-2 lg:hidden">
            <IconAction
              label="Worn today"
              disabled={pending !== null}
              onClick={() => void markWornToday()}
            >
              {pending === "worn" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <CalendarCheck className="size-4" />
              )}
            </IconAction>
            {item.uploadId ? (
              <IconAction
                label="Re-extract"
                disabled={quote?.canAfford === false}
                onClick={() => setConfirmReextract(true)}
              >
                <Wand2 className="size-4" />
              </IconAction>
            ) : null}
            <IconAction
              label={hidden ? "Unhide" : "Hide"}
              disabled={pending !== null}
              onClick={() => void toggleHidden()}
            >
              {pending === "status" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : hidden ? (
                <Eye className="size-4" />
              ) : (
                <EyeOff className="size-4" />
              )}
            </IconAction>
            <IconAction label="Delete item" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="size-4" />
            </IconAction>
          </div>

          <div className="hidden flex-wrap gap-2 lg:flex">
            <button
              type="button"
              className="inline-flex h-10 items-center gap-2 rounded-full border border-hairline px-4 text-sm font-medium disabled:opacity-50"
              disabled={pending !== null}
              onClick={() => void markWornToday()}
            >
              {pending === "worn" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <CalendarCheck className="size-4" />
              )}
              Worn today
            </button>

            {item.uploadId ? (
              <button
                type="button"
                className="inline-flex h-10 items-center gap-2 rounded-full border border-hairline px-4 text-sm font-medium disabled:opacity-50"
                disabled={quote?.canAfford === false}
                onClick={() => setConfirmReextract(true)}
              >
                <Wand2 className="size-4" />
                Re-extract
              </button>
            ) : null}

            <button
              type="button"
              className="inline-flex h-10 items-center gap-2 rounded-full border border-hairline px-4 text-sm font-medium disabled:opacity-50"
              disabled={pending !== null}
              onClick={() => void toggleHidden()}
            >
              {pending === "status" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : hidden ? (
                <Eye className="size-4" />
              ) : (
                <EyeOff className="size-4" />
              )}
              {hidden ? "Unhide" : "Hide"}
            </button>

            <button
              type="button"
              aria-label="Delete item"
              className="inline-flex size-11 items-center justify-center rounded-full text-mute hover:bg-soft-cloud hover:text-sale"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="size-4" />
            </button>
          </div>

          {item.uploadId ? (
            <CreditQuote quote={quote} label="one re-extract" />
          ) : null}

          {job ? (
            <div className="space-y-2 border border-hairline p-3">
              <p className="text-sm font-medium">Re-extraction</p>
              <JobStepper job={job} />
            </div>
          ) : null}

          {item.status === "extracting" ? (
            <p className="flex items-center gap-2 text-sm text-mute">
              <Loader2 className="size-4 animate-spin" />
              Still cutting this one out.
            </p>
          ) : item.status === "needsCredits" ? (
            <p className="text-sm text-mute">
              Extraction paused — out of credits. Resume from{" "}
              <Link href={routes.add} className="font-medium underline">
                Add clothes
              </Link>
              .
            </p>
          ) : item.status === "failed" ? (
            <p className="text-sm text-sale">
              Extraction failed. Try Re-extract to run it again.
            </p>
          ) : null}

          {item.colours.hex.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-medium text-mute">Colours</p>
              <ul className="flex flex-wrap gap-2">
                {item.colours.hex.map((hex) => (
                  <li
                    key={hex}
                    className="flex items-center gap-1.5 rounded-full border border-hairline py-1 pr-2.5 pl-1"
                  >
                    <span
                      className="size-4 rounded-full ring-1 ring-hairline"
                      style={{ backgroundColor: hex }}
                      aria-hidden
                    />
                    <span className="font-mono text-[11px] text-mute uppercase">
                      {hex}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {item.status === "ready" && me && shopSimilarVisible(me.prefs) ? (
            <section className="space-y-3">
              <h2 className="text-[10px] font-medium tracking-[0.14em] text-mute uppercase">
                Shop similar
              </h2>
              <ShopSimilar itemId={item._id} />
            </section>
          ) : null}

          <section
            aria-label="Wear history"
            className="grid grid-cols-3 gap-3 border-y border-hairline py-5"
          >
            <Stat
              label="Worn"
              value={item.wearCount === 0 ? "Never" : `${item.wearCount}×`}
            />
            <Stat
              label="Last worn"
              value={item.lastWornAt ? formatRelative(item.lastWornAt) : "—"}
            />
            <Stat label="Added" value={formatDate(item.createdAt)} />
          </section>

          {sourceUrl ? (
            <div className="space-y-2">
              <p className="text-xs font-medium text-mute">Source photo</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={sourceUrl}
                alt="Original upload"
                className="max-h-48 max-w-full object-contain bg-soft-cloud"
              />
            </div>
          ) : null}

          <section className="space-y-3">
            <h2 className="text-[10px] font-medium tracking-[0.14em] text-mute uppercase">
              Worn together
            </h2>
            {outfits.length === 0 ? (
              <p className="text-sm text-mute">
                Not in an outfit yet.{" "}
                <Link href={routes.outfits} className="font-medium underline">
                  Build one
                </Link>
                .
              </p>
            ) : (
              <ul className="space-y-2">
                {outfits.map((outfit) => (
                  <li key={outfit._id}>
                    <Link
                      href={routes.outfit(outfit._id)}
                      className="text-sm font-medium underline-offset-4 hover:underline"
                    >
                      {outfit.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <ItemForm item={item} />
      </div>

      <ConfirmDialog
        open={confirmReextract}
        onOpenChange={setConfirmReextract}
        title="Re-extract this cutout?"
        description="This costs 1 credit."
        confirmLabel="Re-extract"
        onConfirm={runReextract}
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${item.name}?`}
        description="This cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={deleteItem}
      />
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href={routes.wardrobe}
      className="hidden items-center gap-2 text-sm font-medium text-mute hover:text-ink lg:inline-flex"
    >
      <ArrowLeft className="size-4" />
      Wardrobe
    </Link>
  );
}

function IconAction({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-11 items-center justify-center rounded-full border border-hairline disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-medium text-mute">{label}</dt>
      <dd className="mt-1 text-sm font-medium">{value}</dd>
    </div>
  );
}
