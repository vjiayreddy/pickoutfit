"use client";

import { useMutation, useQuery } from "convex/react";
import { Layers, ShieldOff } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { PlatformSurfaceId, SurfaceVisibility } from "@convex/shared/surfaces";
import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { reportError } from "@/lib/client-errors";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import { routes } from "@/lib/routes";

const VISIBILITY_OPTIONS: { value: SurfaceVisibility; label: string }[] = [
  { value: "live", label: "Live" },
  { value: "coming_soon", label: "Coming soon" },
  { value: "hidden", label: "Hidden" },
];

export function AdminServices() {
  const me = useQuery(api.users.me);
  const isAdmin = me?.role === "admin";
  const rows = useQuery(api.adminSurfaces.list, isAdmin ? {} : "skip");
  const ensureSeeded = useMutation(api.adminSurfaces.ensureSeeded);
  const setVisibility = useMutation(api.adminSurfaces.setVisibility);
  const [seeding, setSeeding] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin || rows === undefined || rows.length > 0 || seeding) return;
    setSeeding(true);
    void ensureSeeded()
      .then((result) => {
        if (result.inserted > 0) {
          toast.success(`Seeded ${result.inserted} surface defaults`);
        }
      })
      .catch((error) => toast.error(reportError(error).message))
      .finally(() => setSeeding(false));
  }, [isAdmin, rows, seeding, ensureSeeded]);

  if (me === undefined) return <div className="h-64 animate-pulse bg-soft-cloud" />;
  if (!isAdmin) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-8">
        <PageHeader title="Services" />
        <EmptyState icon={ShieldOff} title="Admins only" action={<Button href={routes.wardrobe}>Back</Button>} />
      </div>
    );
  }

  async function onChange(surfaceId: PlatformSurfaceId, visibility: SurfaceVisibility) {
    setPendingId(String(surfaceId));
    try {
      await setVisibility({ surfaceId, visibility });
      toast.success("Visibility updated");
    } catch (error) {
      toast.error(reportError(error).message);
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8">
      <PageHeader
        title="Services"
        description="Control which product surfaces appear for users. Hidden removes nav and deep links; Coming soon can still show on the services hub."
        actions={<Button href={routes.admin} variant="secondary" size="sm">Overview</Button>}
      />

      {rows === undefined || (rows.length === 0 && seeding) ? (
        <div className="h-40 animate-pulse bg-soft-cloud" />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No surfaces yet"
          action={
            <Button
              type="button"
              onClick={() => {
                setSeeding(true);
                void ensureSeeded()
                  .then((result) => toast.success(`Seeded ${result.inserted} defaults`))
                  .catch((error) => toast.error(reportError(error).message))
                  .finally(() => setSeeding(false));
              }}
            >
              Seed defaults
            </Button>
          }
        />
      ) : (
        <ul className="divide-y divide-hairline border-y border-hairline">
          {rows.map((row) => (
            <li
              key={row.id}
              className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-ink">{row.label}</p>
                  {row.lockedLive ? (
                    <span className="text-[11px] font-medium uppercase tracking-wide text-mute">
                      Required
                    </span>
                  ) : null}
                  <span
                    className={cn(
                      "text-[11px] font-medium uppercase tracking-wide",
                      row.visibility === "live"
                        ? "text-success"
                        : row.visibility === "coming_soon"
                          ? "text-mute"
                          : "text-sale",
                    )}
                  >
                    {row.visibility.replace("_", " ")}
                  </span>
                </div>
                <p className="text-sm text-mute">{row.blurb}</p>
                <p className="text-xs text-mute">
                  {row.route}
                  {row.updatedAt ? ` · Updated ${formatDate(row.updatedAt)}` : ""}
                  {row.overridden ? "" : " · Using code default"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {VISIBILITY_OPTIONS.map((option) => {
                  const disabled =
                    pendingId === row.id ||
                    (row.lockedLive && option.value !== "live");
                  const active = row.visibility === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        if (active) return;
                        void onChange(row.id, option.value);
                      }}
                      className={cn(
                        "h-10 rounded-full px-4 text-sm font-medium transition active:scale-95 active:opacity-50 disabled:opacity-40",
                        active
                          ? "bg-ink text-canvas"
                          : "bg-canvas text-ink ring-1 ring-inset ring-hairline",
                      )}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
