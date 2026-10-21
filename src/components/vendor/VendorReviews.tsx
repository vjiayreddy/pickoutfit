"use client";

import { useMutation, usePaginatedQuery } from "convex/react";
import { MessageSquare } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { ReviewStatus } from "@convex/shared/reviews";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { EmptyState } from "@/components/common/EmptyState";
import { StarRatingDisplay } from "@/components/shop/StarRating";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useVendor } from "@/components/vendor/VendorDesk";
import { reportError } from "@/lib/client-errors";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";

const FILTERS: { value: ReviewStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "visible", label: "Visible" },
  { value: "hidden", label: "Hidden" },
];

export function VendorReviews() {
  const vendor = useVendor();
  const canModerate = vendor.membership.role === "owner" || vendor.membership.role === "manager";
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["value"]>("all");
  const { results, status, loadMore } = usePaginatedQuery(
    api.vendorReviews.list,
    { status: filter === "all" ? undefined : filter },
    { initialNumItems: 20 },
  );
  const reply = useMutation(api.vendorReviews.reply);
  const clearReply = useMutation(api.vendorReviews.clearReply);
  const hide = useMutation(api.vendorReviews.hide);
  const unhide = useMutation(api.vendorReviews.unhide);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [replyOpen, setReplyOpen] = useState<Id<"productReviews"> | null>(null);
  const [pendingId, setPendingId] = useState<Id<"productReviews"> | null>(null);

  async function submitReply(reviewId: Id<"productReviews">) {
    const body = replyDrafts[reviewId]?.trim() ?? "";
    setPendingId(reviewId);
    try {
      await reply({ reviewId, body });
      toast.success("Reply posted");
      setReplyOpen(null);
    } catch (error) {
      toast.error(reportError(error).message);
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-mute">
          Reply to shopper reviews and hide anything that shouldn’t stay public.
        </p>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((item) => {
            const active = filter === item.value;
            return (
              <button
                key={item.value}
                type="button"
                onClick={() => setFilter(item.value)}
                className={cn(
                  "h-10 rounded-full px-4 text-sm font-medium transition active:scale-95 active:opacity-50",
                  active
                    ? "bg-ink text-canvas"
                    : "bg-canvas text-ink ring-1 ring-inset ring-hairline",
                )}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {status === "LoadingFirstPage" ? (
        <div className="h-40 animate-pulse bg-soft-cloud" />
      ) : results.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="No reviews yet"
          description="When shoppers review products they bought from your store, they’ll show up here."
        />
      ) : (
        <ul className="divide-y divide-hairline border-y border-hairline">
          {results.map((review) => {
            const drafting = replyOpen === review.id;
            const draft =
              replyDrafts[review.id] ?? review.vendorReply ?? "";
            return (
              <li key={review.id} className="space-y-3 py-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="truncate text-sm font-medium">{review.productName}</p>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-mute">
                      <StarRatingDisplay value={review.rating} />
                      <span>{review.authorName}</span>
                      <span>· {formatDate(review.createdAt)}</span>
                      {review.status === "hidden" ? (
                        <span className="rounded-full bg-soft-cloud px-2 py-0.5 font-medium text-ink">
                          Hidden
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setReplyOpen(drafting ? null : review.id);
                        setReplyDrafts((current) => ({
                          ...current,
                          [review.id]: review.vendorReply ?? "",
                        }));
                      }}
                    >
                      {review.vendorReply ? "Edit reply" : "Reply"}
                    </Button>
                    {canModerate ? (
                      review.status === "visible" ? (
                        <ConfirmDialog
                          title="Hide this review?"
                          description="It will leave the product page until you unhide it."
                          confirmLabel="Hide"
                          destructive
                          onConfirm={async () => {
                            await hide({ reviewId: review.id });
                            toast.success("Review hidden");
                          }}
                          trigger={
                            <Button type="button" variant="secondary" size="sm">
                              Hide
                            </Button>
                          }
                        />
                      ) : (
                        <ConfirmDialog
                          title="Unhide this review?"
                          description="It will show again on the product page."
                          confirmLabel="Unhide"
                          onConfirm={async () => {
                            await unhide({ reviewId: review.id });
                            toast.success("Review visible again");
                          }}
                          trigger={
                            <Button type="button" variant="secondary" size="sm">
                              Unhide
                            </Button>
                          }
                        />
                      )
                    ) : null}
                  </div>
                </div>

                {review.title ? (
                  <p className="text-sm font-medium">{review.title}</p>
                ) : null}
                <p className="max-w-prose text-sm leading-relaxed text-mute whitespace-pre-wrap">
                  {review.body}
                </p>
                {review.imageUrls.length > 0 ? (
                  <ul className="flex flex-wrap gap-2">
                    {review.imageUrls.map((url) => (
                      <li key={url} className="size-16 overflow-hidden bg-soft-cloud">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="" className="h-full w-full object-cover" />
                      </li>
                    ))}
                  </ul>
                ) : null}

                {review.vendorReply && !drafting ? (
                  <div className="space-y-1 border-l-2 border-hairline pl-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-mute">
                      Your reply
                      {review.vendorReplyAt
                        ? ` · ${formatDate(review.vendorReplyAt)}`
                        : ""}
                    </p>
                    <p className="text-sm whitespace-pre-wrap">{review.vendorReply}</p>
                    <button
                      type="button"
                      className="text-xs font-medium text-mute underline"
                      onClick={() =>
                        void clearReply({ reviewId: review.id })
                          .then(() => toast.success("Reply removed"))
                          .catch((error) => toast.error(reportError(error).message))
                      }
                    >
                      Remove reply
                    </button>
                  </div>
                ) : null}

                {drafting ? (
                  <div className="space-y-3">
                    <Textarea
                      value={draft}
                      onChange={(event) =>
                        setReplyDrafts((current) => ({
                          ...current,
                          [review.id]: event.target.value,
                        }))
                      }
                      placeholder="Thank the shopper or answer their question…"
                      className="min-h-24 rounded-none bg-soft-cloud"
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        disabled={pendingId === review.id || draft.trim().length < 2}
                        onClick={() => void submitReply(review.id)}
                      >
                        {pendingId === review.id ? "Saving…" : "Post reply"}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setReplyOpen(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {status === "CanLoadMore" ? (
        <Button type="button" variant="secondary" onClick={() => loadMore(20)}>
          Load more
        </Button>
      ) : null}
    </div>
  );
}
