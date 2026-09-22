import type { Metadata } from "next";
import { AdminDashboard } from "@/components/admin/admin-dashboard";

export const metadata: Metadata = {
  title: "Admin",
  description: "Revenue, cost of goods and the state of the credit meter.",
};

export default function AdminPage() {
  return <AdminDashboard />;
}
