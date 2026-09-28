"use server";

import { redirect } from "next/navigation";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  PRODUCT_CATEGORIES,
  type ProductCategory,
} from "@convex/shared/products";
import type { Presentation } from "@convex/shared/wardrobe";
import { PRESENTATIONS } from "@convex/shared/wardrobe";
import { ORDER_STATUSES, type OrderStatus } from "@convex/shared/products";
import {
  ownerErrorMessage,
  readOwnerToken,
  withOwner,
} from "@/lib/owner-session";

export type OwnerFormState = { error: string } | null;

const PRESENTATION_SET = new Set<string>(PRESENTATIONS);
const CATEGORY_SET = new Set<string>(PRODUCT_CATEGORIES);
const STATUS_SET = new Set<string>(ORDER_STATUSES);
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function categoryOf(value: string): ProductCategory {
  if (!CATEGORY_SET.has(value)) throw new Error("Choose a category.");
  return value as ProductCategory;
}

function presentationOf(value: string): Presentation {
  if (!PRESENTATION_SET.has(value)) throw new Error("Choose who this product is for.");
  return value as Presentation;
}

function rethrowRedirect(error: unknown): void {
  if (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof error.digest === "string" &&
    error.digest.startsWith("NEXT_REDIRECT")
  ) {
    throw error;
  }
}

async function storeImage(file: File): Promise<Id<"_storage">> {
  if (!IMAGE_TYPES.has(file.type)) throw new Error("Use a JPEG, PNG, or WebP image.");
  if (file.size > MAX_IMAGE_BYTES) throw new Error("Image must be 5 MB or smaller.");
  const uploadUrl = await withOwner((client, token) =>
    client.mutation(api.owner.generateUploadUrl, { sessionToken: token }),
  );
  const uploaded = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!uploaded.ok) throw new Error("Could not store that image.");
  const json: unknown = await uploaded.json();
  if (
    !json ||
    typeof json !== "object" ||
    !("storageId" in json) ||
    typeof json.storageId !== "string"
  ) {
    throw new Error("Could not store that image.");
  }
  return json.storageId as Id<"_storage">;
}

function imageFile(formData: FormData): File | null {
  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) return null;
  return file;
}

export async function createProduct(
  _prev: OwnerFormState,
  formData: FormData,
): Promise<OwnerFormState> {
  try {
    const token = await readOwnerToken();
    if (!token) redirect("/owner/sign-in");
    const file = imageFile(formData);
    const storageId = file ? await storeImage(file) : undefined;
    await withOwner((client, sessionToken) =>
      client.mutation(api.owner.create, {
        sessionToken,
        category: categoryOf(field(formData, "category")),
        presentation: presentationOf(field(formData, "presentation")),
        name: field(formData, "name"),
        priceInr: Number(field(formData, "priceInr")),
        storageId,
        active: formData.get("active") === "1",
      }),
    );
  } catch (error) {
    rethrowRedirect(error);
    return { error: ownerErrorMessage(error) };
  }
  redirect("/owner/products");
}

export async function updateProduct(
  _prev: OwnerFormState,
  formData: FormData,
): Promise<OwnerFormState> {
  try {
    const token = await readOwnerToken();
    if (!token) redirect("/owner/sign-in");
    const productId = field(formData, "productId") as Id<"products">;
    const file = imageFile(formData);
    const storageId = file ? await storeImage(file) : undefined;
    await withOwner((client, sessionToken) =>
      client.mutation(api.owner.update, {
        sessionToken,
        productId,
        category: categoryOf(field(formData, "category")),
        presentation: presentationOf(field(formData, "presentation")),
        name: field(formData, "name"),
        priceInr: Number(field(formData, "priceInr")),
        storageId,
        active: formData.get("active") === "1",
      }),
    );
  } catch (error) {
    rethrowRedirect(error);
    return { error: ownerErrorMessage(error) };
  }
  redirect("/owner/products");
}

export async function setOrderStatus(
  _prev: OwnerFormState,
  formData: FormData,
): Promise<OwnerFormState> {
  const status = field(formData, "status");
  if (!STATUS_SET.has(status)) return { error: "Choose a status." };
  const orderId = field(formData, "orderId");
  try {
    await withOwner((client, sessionToken) =>
      client.mutation(api.owner.setStatus, {
        sessionToken,
        orderId: orderId as Id<"orders">,
        status: status as OrderStatus,
      }),
    );
  } catch (error) {
    rethrowRedirect(error);
    return { error: ownerErrorMessage(error) };
  }
  redirect(`/owner/orders/${orderId}`);
}

export async function setProductActive(formData: FormData): Promise<void> {
  const productId = field(formData, "productId") as Id<"products">;
  const active = field(formData, "active") === "1";
  await withOwner((client, sessionToken) =>
    client.mutation(api.owner.setActive, { sessionToken, productId, active }),
  );
  redirect("/owner/products");
}
