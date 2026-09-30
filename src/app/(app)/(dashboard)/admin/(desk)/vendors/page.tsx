import type { Metadata } from "next";
import { AdminVendors } from "@/components/admin/admin-vendors";

export const metadata: Metadata = {
  title: "Vendors",
  description: "Approve, suspend and configure marketplace stores.",
};

export default function AdminVendorsPage() {
  return <AdminVendors />;
}
