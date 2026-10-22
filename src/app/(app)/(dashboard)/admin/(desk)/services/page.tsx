import type { Metadata } from "next";
import { AdminServices } from "@/components/admin/admin-services";

export const metadata: Metadata = {
  title: "Services",
  description: "Control which product surfaces are visible to users.",
};

export default function AdminServicesPage() {
  return <AdminServices />;
}
