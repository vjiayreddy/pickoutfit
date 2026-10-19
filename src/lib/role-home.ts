import type { UserRole } from "@convex/shared/validators";
import { routes } from "@/lib/routes";

/** Post-auth home for each app role. */
export function homeForRole(role: UserRole | null | undefined): string {
  if (role === "admin") return routes.admin;
  if (role === "vendor") return routes.vendor;
  return routes.wardrobe;
}
