"use client";

import Link from "next/link";
import type { FunctionReturnType } from "convex/server";
import { api } from "@convex/_generated/api";
import { CATEGORY_LABELS } from "@convex/shared/wardrobe";
import { ItemImage } from "@/components/common/ItemImage";
import { routes } from "@/lib/routes";

type Item = FunctionReturnType<typeof api.items.list>[number];

export function ItemTile({ item }: { item: Item }) {
  return (
    <li className="group">
      <Link href={routes.item(item._id)} className="block space-y-3" aria-label={item.name}>
        <div className="relative">
          <ItemImage
            src={item.url}
            alt={item.name}
            aspect="aspect-square"
            className="p-6 sm:p-9"
            imgClassName="transition-transform duration-200 group-hover:scale-[1.03]"
          />
          {item.status === "needsCredits" ? (
            <span className="absolute right-2 bottom-2 rounded-full bg-canvas px-2 py-1 text-[11px] font-medium">
              Needs credits
            </span>
          ) : null}
          {item.duplicateOfId ? (
            <span className="absolute top-2 left-2 rounded-full bg-canvas px-2 py-1 text-[11px] font-medium">
              Possible duplicate
            </span>
          ) : null}
        </div>
        <div className="space-y-1 px-0.5">
          <p className="line-clamp-2 text-sm font-medium leading-snug">{item.name}</p>
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-[11px] font-medium tracking-wide text-mute uppercase">
              {CATEGORY_LABELS[item.category]}
            </p>
            <div
              className="flex shrink-0 items-center -space-x-1"
              aria-label={`Colour: ${item.colours.primary}`}
            >
              {item.colours.hex.slice(0, 3).map((hex, index) => (
                <span
                  key={`${hex}-${index}`}
                  className="size-3 rounded-full border border-canvas ring-1 ring-hairline"
                  style={{ backgroundColor: hex }}
                />
              ))}
            </div>
          </div>
        </div>
      </Link>
    </li>
  );
}
