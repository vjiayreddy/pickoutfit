import { redirect } from "next/navigation";
import { routes } from "@/lib/routes";

/** Old Build-a-look URL → Trial Room. */
export default function ShopLookRedirectPage() {
  redirect(routes.trialRoom);
}
