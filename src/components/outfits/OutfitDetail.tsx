"use client";

import { useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  CalendarCheck,
  Ellipsis,
  Loader2,
  Scissors,
  Share2,
  Sparkles,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { JobStepper } from "@/components/common/JobStepper";
import { OutfitCollage } from "@/components/common/OutfitCollage";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { StickyAction } from "@/components/common/StickyAction";
import { AppHeaderTitle } from "@/components/layout/app-header";
import {
  draftFromOutfit,
  OutfitForm,
} from "@/components/outfits/OutfitForm";
import { GroomSheet } from "@/components/renders/GroomSheet";
import { RenderSheet } from "@/components/renders/RenderSheet";
import { reportError, toClientError } from "@/lib/client-errors";
import { formatDate } from "@/lib/format";
import { routes } from "@/lib/routes";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function OutfitDetail({ outfitId }: { outfitId: string }) {
  const outfit = useQuery(api.outfits.get, { outfitId });
  const renders = useQuery(
    api.renders.listByOutfit,
    outfit?._id ? { outfitId: outfit._id } : "skip",
  );
  const me = useQuery(api.users.me);
  const router = useRouter();
  const markWorn = useMutation(api.outfits.markWorn);
  const removeOutfit = useMutation(api.outfits.remove);
  const share = useMutation(api.renders.share);
  const unshare = useMutation(api.renders.unshare);
  const removeRender = useMutation(api.renders.remove);
  const regenerate = useMutation(api.renders.regenerate);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmRenderId, setConfirmRenderId] = useState<Id<"renders"> | null>(null);
  const [groomRenderId, setGroomRenderId] = useState<Id<"renders"> | null>(
    null,
  );
  const [jobId, setJobId] = useState<Id<"jobs"> | null>(null);
  const job = useQuery(api.jobs.get, jobId ? { jobId } : "skip");
  const canShare = Boolean(me?.balance.features.includes("sharing"));
  const canGroom = me?.prefs.presentation === "masculine";
  const groomTarget = renders?.find((r) => r._id === groomRenderId);

  async function markWornToday() {
    try {
      await markWorn({ outfitId: outfit!._id });
      toast.success("Marked as worn today.");
    } catch (e) {
      toast.error(reportError(e).message);
    }
  }

  if (outfit === undefined) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-32 animate-pulse bg-soft-cloud" />
        <div className="h-64 animate-pulse bg-soft-cloud" />
      </div>
    );
  }

  if (outfit === null) {
    return (
      <div className="space-y-4">
        <Link
          href={routes.outfits}
          className="inline-flex items-center gap-2 text-sm text-mute"
        >
          <ArrowLeft className="size-4" /> Outfits
        </Link>
        <h1 className="font-display text-4xl uppercase tracking-tight">
          Outfit not found
        </h1>
      </div>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      <AppHeaderTitle title={outfit.name} />
      <Link
        href={routes.outfits}
        className="hidden items-center gap-2 text-sm font-medium text-mute hover:text-ink lg:inline-flex"
      >
        <ArrowLeft className="size-4" /> Outfits
      </Link>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-mute sm:text-sm">
            Outfit
          </p>
          <h1 className="mt-1 font-display text-3xl font-medium uppercase leading-[0.9] tracking-tight sm:mt-2 sm:text-5xl">
            {outfit.name}
          </h1>
          {outfit.occasion ? (
            <p className="mt-3 text-base text-mute">{outfit.occasion}</p>
          ) : null}
          <div className="mt-4">
            <OutfitCollage items={outfit.items} tile="size-16" max={8} />
          </div>
        </div>
        <div className="hidden flex-wrap gap-2 lg:flex">
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="inline-flex h-12 items-center gap-2 rounded-full bg-ink px-6 text-sm font-medium text-canvas"
          >
            <Sparkles className="size-4" />
            Try on
          </button>
          <button
            type="button"
            className="inline-flex h-12 items-center gap-2 rounded-full border border-hairline px-5 text-sm font-medium"
            onClick={() => void markWornToday()}
          >
            <CalendarCheck className="size-4" />
            Worn today
          </button>
          <button
            type="button"
            aria-label="Delete outfit"
            className="inline-flex size-12 items-center justify-center rounded-full text-mute hover:bg-soft-cloud hover:text-sale"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="size-4" />
          </button>
        </div>
        <button
          type="button"
          aria-label="More outfit actions"
          className="inline-flex h-11 items-center gap-2 self-start rounded-full border border-hairline px-4 text-sm font-medium lg:hidden"
          onClick={() => setMoreOpen(true)}
        >
          <Ellipsis className="size-4" />
          More
        </button>
      </div>

      {job ? (
        <div className="space-y-2 border border-hairline p-4">
          <p className="text-sm font-medium">
            {job.type === "groom"
              ? "Styling in progress"
              : "Try-on in progress"}
          </p>
          <JobStepper job={job} />
        </div>
      ) : null}

      {renders && renders.length > 0 ? (
        <section className="space-y-4">
          <h2 className="text-sm font-medium">Try-ons</h2>
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {renders.map((render) => (
              <li key={render._id} className="space-y-2">
                <div className="relative aspect-[3/4] bg-soft-cloud">
                  {render.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={render.url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-mute">
                      {render.status === "pending" ? (
                        <Loader2 className="size-5 animate-spin" />
                      ) : (
                        render.status
                      )}
                    </div>
                  )}
                </div>
                <p className="text-[11px] text-mute capitalize">
                  {render.kind === "groom" && render.groomingLabel
                    ? `${render.groomingLabel} · `
                    : ""}
                  {render.quality} · {render.status}
                  {render.completedAt
                    ? ` · ${formatDate(render.completedAt)}`
                    : ""}
                </p>
                <div className="flex flex-wrap gap-1">
                  {render.status === "done" && render.url ? (
                    <>
                      <button
                        type="button"
                        className="inline-flex h-11 items-center rounded-full border border-hairline px-3 text-xs font-medium disabled:opacity-40"
                        disabled={!canShare && !render.shareToken}
                        onClick={async () => {
                          try {
                            if (render.shareToken) {
                              await unshare({ renderId: render._id });
                              toast.success("Link revoked.");
                              return;
                            }
                            const { token } = await share({
                              renderId: render._id,
                            });
                            const url = `${window.location.origin}${routes.share(token)}`;
                            await navigator.clipboard.writeText(url);
                            toast.success("Share link copied.");
                          } catch (e) {
                            const err = toClientError(e);
                            toast.error(
                              err.code === "FEATURE_LOCKED"
                                ? "Sharing is on the Pro plan."
                                : err.message,
                            );
                          }
                        }}
                      >
                        <Share2 className="mr-1 inline size-3" />
                        {render.shareToken ? "Unshare" : "Share"}
                      </button>
                      {canGroom ? (
                        <button
                          type="button"
                          className="inline-flex h-11 items-center rounded-full border border-hairline px-3 text-xs font-medium"
                          onClick={() => setGroomRenderId(render._id)}
                        >
                          <Scissors className="mr-1 inline size-3" />
                          Style
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="inline-flex h-11 items-center rounded-full border border-hairline px-3 text-xs font-medium"
                        onClick={async () => {
                          try {
                            const result = await regenerate({
                              renderId: render._id,
                            });
                            setJobId(result.jobId);
                            toast.success("Regenerating…");
                          } catch (e) {
                            toast.error(reportError(e).message);
                          }
                        }}
                      >
                        Redo
                      </button>
                    </>
                  ) : null}
                  <button
                    type="button"
                    className="inline-flex h-11 items-center rounded-full px-3 text-xs font-medium text-mute hover:text-sale"
                    onClick={() => setConfirmRenderId(render._id)}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-4 border-t border-hairline pt-8">
        <h2 className="text-sm font-medium">Edit outfit</h2>
        <OutfitForm
          mode="edit"
          outfitId={outfit._id}
          initial={draftFromOutfit(outfit)}
          onTryOn={() => setSheetOpen(true)}
        />
      </section>

      <RenderSheet
        outfitId={outfit._id}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onStarted={setJobId}
      />
      <StickyAction onClick={() => setSheetOpen(true)}>
        <Sparkles className="size-4" />
        Try on
      </StickyAction>
      <Dialog open={moreOpen} onOpenChange={setMoreOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Outfit</DialogTitle>
          </DialogHeader>
          <button
            type="button"
            className="flex h-12 items-center gap-2 text-left text-sm font-medium"
            onClick={() => {
              setMoreOpen(false);
              void markWornToday();
            }}
          >
            <CalendarCheck className="size-4" />
            Worn today
          </button>
          <button
            type="button"
            className="flex h-12 items-center gap-2 text-left text-sm font-medium text-sale"
            onClick={() => {
              setMoreOpen(false);
              setConfirmDelete(true);
            }}
          >
            <Trash2 className="size-4" />
            Delete outfit
          </button>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${outfit.name}?`}
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          await removeOutfit({ outfitId: outfit._id });
          toast.success("Outfit deleted.");
          router.push(routes.outfits);
        }}
      />
      <ConfirmDialog
        open={confirmRenderId !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmRenderId(null);
        }}
        title="Delete this try-on?"
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (!confirmRenderId) return;
          await removeRender({ renderId: confirmRenderId });
          toast.success("Deleted.");
        }}
      />
      {groomTarget ? (
        <GroomSheet
          renderId={groomTarget._id}
          quality={groomTarget.quality}
          open={Boolean(groomRenderId)}
          onOpenChange={(open) => {
            if (!open) setGroomRenderId(null);
          }}
          onStarted={setJobId}
        />
      ) : null}
    </div>
  );
}
