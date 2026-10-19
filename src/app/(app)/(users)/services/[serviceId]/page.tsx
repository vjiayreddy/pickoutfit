"use client";

import { use } from "react";
import { ServiceStudio } from "@/components/services/ServicePages";

export default function ServicePage({
  params,
}: {
  params: Promise<{ serviceId: string }>;
}) {
  const { serviceId } = use(params);
  return <ServiceStudio serviceId={serviceId} />;
}
