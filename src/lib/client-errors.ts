import { ConvexError } from "convex/values";

export type ClientError = {
  code?: string;
  message: string;
};

/** Normalize Convex / network failures into a message the UI can show. */
export function toClientError(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
): ClientError {
  if (error instanceof ConvexError) {
    const data = error.data;
    if (typeof data === "object" && data !== null && "message" in data) {
      const message = (data as { message?: unknown }).message;
      const code = (data as { code?: unknown }).code;
      return {
        code: typeof code === "string" ? code : undefined,
        message: typeof message === "string" ? message : fallback,
      };
    }
    return { message: error.message || fallback };
  }
  if (error instanceof Error && error.message) {
    return { message: error.message };
  }
  return { message: fallback };
}

export function reportError(error: unknown, fallback?: string): ClientError {
  const client = toClientError(error, fallback);
  console.error(error);
  return client;
}
