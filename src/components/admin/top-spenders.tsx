"use client";

import { useQuery } from "convex/react";
import { Users } from "lucide-react";
import { EmptyState } from "@/components/common/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { adminApi } from "@/lib/admin-api";
import { formatNumber, formatUsd, pluralize } from "@/lib/format";
import type { AdminWindow } from "./window-toggle";

export function TopSpenders({ days }: { days: AdminWindow }) {
  const result = useQuery(adminApi.topSpenders, { days, limit: 10 });
  const spenders = result?.rows;
  const truncated = result?.truncated ?? false;

  return (
    <section className="border border-hairline">
      <header className="space-y-1 border-b border-hairline px-4 py-4">
        <h2 className="text-base font-medium">Top spenders</h2>
        <p className="text-sm text-mute">
          Credits spent over the last {pluralize(days, "day")}, with the image cost they actually
          cost us.
          {truncated
            ? " Ranked from the most recent ledger lines only, so the tail may be missing."
            : null}
        </p>
      </header>

      <div className="overflow-x-auto">
        {spenders === undefined ? (
          <div className="space-y-3 p-4" aria-busy="true" aria-label="Loading spenders">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-9 w-full rounded-none" />
            ))}
          </div>
        ) : spenders.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={Users}
              title="Nobody has spent a credit"
              description="Once renders and extractions run in this window, the biggest spenders show up here."
              className="min-h-[200px] border-0"
            />
          </div>
        ) : (
          <table className="w-full min-w-[32rem] text-left text-sm">
            <thead>
              <tr className="border-b border-hairline text-mute">
                <th className="px-4 py-3 font-medium">User</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">Plan</th>
                <th className="px-4 py-3 text-right font-medium">Credits spent</th>
                <th className="px-4 py-3 text-right font-medium">COGS</th>
              </tr>
            </thead>
            <tbody>
              {spenders.map((spender) => (
                <tr key={spender.userId} className="border-b border-hairline last:border-0">
                  <td
                    className="max-w-[24ch] truncate px-4 py-3 font-medium"
                    title={spender.email ?? spender.name}
                  >
                    {spender.name ?? spender.email ?? "Unknown"}
                    {spender.name && spender.email ? (
                      <span className="ml-2 font-normal text-mute">{spender.email}</span>
                    ) : null}
                  </td>
                  <td className="hidden px-4 py-3 capitalize sm:table-cell">
                    <span className="rounded-full border border-hairline px-2 py-0.5 text-xs">
                      {spender.plan}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums">
                    {formatNumber(spender.creditsSpent)}
                  </td>
                  <td className="px-4 py-3 text-right text-mute tabular-nums">
                    {formatUsd(spender.cogsUsd)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
