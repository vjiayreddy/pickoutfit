import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import {
  BEARD_LABELS,
  HAIR_LABELS,
  groomingCaption,
  type GroomingSelection,
} from "../shared/grooming";
import type { StyleRefServiceId } from "../shared/services";

const STYLE_REF_SCAN = 40;

/** Saves the chosen cuts as style refs and attaches them to a new profile-photo look. */
export async function recordAvatarLook(
  ctx: MutationCtx,
  userId: Id<"users">,
  avatarId: Id<"avatars">,
  selection: GroomingSelection,
): Promise<Id<"looks">> {
  const now = Date.now();
  const lookId = await ctx.db.insert("looks", {
    userId,
    avatarId,
    name: groomingCaption(selection),
    createdAt: now,
  });
  if (selection.hair !== "keep") {
    const styleRefId = await ensureOptionRef(
      ctx,
      userId,
      "hairstyle",
      HAIR_LABELS[selection.hair],
      now,
    );
    await ctx.db.insert("lookRefs", {
      lookId,
      styleRefId,
      serviceId: "hairstyle",
    });
  }
  if (selection.beard !== "keep") {
    const styleRefId = await ensureOptionRef(
      ctx,
      userId,
      "beard",
      BEARD_LABELS[selection.beard],
      now,
    );
    await ctx.db.insert("lookRefs", {
      lookId,
      styleRefId,
      serviceId: "beard",
    });
  }
  return lookId;
}

async function ensureOptionRef(
  ctx: MutationCtx,
  userId: Id<"users">,
  serviceId: StyleRefServiceId,
  label: string,
  now: number,
): Promise<Id<"styleRefs">> {
  const existing = await ctx.db
    .query("styleRefs")
    .withIndex("by_user_service", (q) =>
      q.eq("userId", userId).eq("serviceId", serviceId),
    )
    .take(STYLE_REF_SCAN);
  const match = existing.find(
    (row) => row.origin === "option" && row.label === label && row.status === "ready",
  );
  if (match) return match._id;
  return ctx.db.insert("styleRefs", {
    userId,
    serviceId,
    origin: "option",
    label,
    status: "ready",
    createdAt: now,
  });
}
