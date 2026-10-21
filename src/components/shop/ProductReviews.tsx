"use client";

import { usePaginatedQuery, useQuery } from "convex/react";
import { MessageSquare } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { EmptyState } from "@/components/common/EmptyState";
import { ReviewForm } from "@/components/shop/ReviewForm";
import { StarRatingDisplay } from "@/components/shop/StarRating";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";

export function ProductReviews({
  productId,
  productName,
  reviewCount,
  ratingAverage,
}: {
  productId: Id<"products">;
  productName: string;
  reviewCount: number;
  ratingAverage: number | null;
}) {
  const searchParams = useSearchParams();
  const canReview = useQuery(api.reviews.canReview, { productId });
  const mine = useQuery(api.reviews.mineForProduct, { productId });
  const { results, status, loadMore } = usePaginatedQuery(
    api.reviews.listForProduct,
    { productId },
    { initialNumItems: 10 },
  );
  const [formOpen, setFormOpen] = useState(false);

  useEffect(() => {
    if (searchParams.get("review") === "1" && canReview?.eligible) {
      setFormOpen(true);
    }
  }, [searchParams, canReview?.eligible]);

  const showWrite =
    canReview?.eligible === true || (mine !== undefined && mine !== null);

  return (
    <section className="space-y-6 border-t border-hairline pt-10" aria-label="Reviews">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-lg font-medium tracking-tight">Reviews</h2>
          {reviewCount > 0 && ratingAverage !== null ? (
            <div className="flex flex-wrap items-center gap-2 text-sm text-mute">
              <StarRatingDisplay value={ratingAverage} size="md" />
              <span className="font-medium text-ink">{ratingAverage.toFixed(1)}</span>
              <span>
                · {reviewCount} review{reviewCount === 1 ? "" : "s"}
              </span>
            </div>
          ) : (
            <p className="text-sm text-mute">No reviews yet</p>
          )}
        </div>
        {showWrite ? (
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="h-10 rounded-full bg-ink px-5 text-sm font-medium text-canvas"
          >
            {mine ? "Edit your review" : "Write a review"}
          </button>
        ) : canReview?.reason ? (
          <p className="text-xs text-mute">{canReview.reason}</p>
        ) : null}
      </div>

      {status === "LoadingFirstPage" ? (
        <div className="h-32 animate-pulse bg-soft-cloud" />
      ) : results.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="No reviews yet"
          description="Verified buyers can share how this piece fits and wears."
        />
      ) : (
        <ul className="divide-y divide-hairline border-y border-hairline">
          {results.map((review) => (
            <li key={review.id} className="space-y-3 py-6">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <StarRatingDisplay value={review.rating} />
                <p className="text-sm font-medium">{review.authorName}</p>
                <p className="text-xs text-mute">{formatDate(review.createdAt)}</p>
              </div>
              {review.title ? (
                <p className="text-sm font-medium tracking-tight">{review.title}</p>
              ) : null}
              <p className="max-w-prose text-sm leading-relaxed text-mute whitespace-pre-wrap">
                {review.body}
              </p>
              {review.imageUrls.length > 0 ? (
                <ul className="flex flex-wrap gap-2">
                  {review.imageUrls.map((url) => (
                    <li key={url} className="size-20 overflow-hidden bg-soft-cloud">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="" className="h-full w-full object-cover" />
                    </li>
                  ))}
                </ul>
              ) : null}
              {review.vendorReply ? (
                <div className="space-y-1 border-l-2 border-hairline pl-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-mute">
                    Response from store
                    {review.vendorReplyAt
                      ? ` · ${formatDate(review.vendorReplyAt)}`
                      : ""}
                  </p>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">
                    {review.vendorReply}
                  </p>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {status === "CanLoadMore" ? (
        <Button type="button" variant="secondary" onClick={() => loadMore(10)}>
          Load more reviews
        </Button>
      ) : null}

      <ReviewForm
        open={formOpen}
        onOpenChange={setFormOpen}
        productId={productId}
        productName={productName}
        existing={
          mine
            ? {
                id: mine.id,
                rating: mine.rating,
                title: mine.title,
                body: mine.body,
                imageStorageIds: mine.imageStorageIds,
                imageUrls: mine.imageUrls,
              }
            : null
        }
      />
    </section>
  );
}
