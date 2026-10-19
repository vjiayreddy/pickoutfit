"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Plus } from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { reportError } from "@/lib/client-errors";
import { cn } from "@/lib/cn";
import { toast } from "sonner";

type Props = {
  brandId: Id<"brands"> | null;
  brandName: string;
  onChange: (next: { brandId: Id<"brands"> | null; brandName: string }) => void;
  disabled?: boolean;
};

type BrandOption = {
  id: Id<"brands"> | "__create__";
  name: string;
  slug?: string;
};

/**
 * Pick an existing store brand or create one by name.
 * "Nike" / "nike" collapse to the same row via server-side slug upsert.
 */
export function BrandPicker({ brandId, brandName, onChange, disabled }: Props) {
  const brands = useQuery(api.brands.list, { activeOnly: true });
  const ensure = useMutation(api.brands.ensure);
  const [inputValue, setInputValue] = useState("");
  const [creating, setCreating] = useState(false);

  const selected = useMemo((): BrandOption | null => {
    if (!brands) return null;
    if (brandId) {
      const row = brands.find((item) => item._id === brandId);
      if (row) return { id: row._id, name: row.name, slug: row.slug };
    }
    if (brandName.trim()) return { id: brandId ?? "__create__", name: brandName };
    return null;
  }, [brands, brandId, brandName]);

  const options = useMemo((): BrandOption[] => {
    if (!brands) return [];
    const q = inputValue.trim().toLowerCase();
    const filtered = q
      ? brands.filter(
          (row) => row.name.toLowerCase().includes(q) || row.slug.includes(q),
        )
      : brands;
    const items: BrandOption[] = filtered.map((row) => ({
      id: row._id,
      name: row.name,
      slug: row.slug,
    }));
    const exact = brands.some(
      (row) => row.name.toLowerCase() === q || row.slug === q,
    );
    if (q && !exact) {
      items.push({ id: "__create__", name: inputValue.trim() });
    }
    return items;
  }, [brands, inputValue]);

  async function createBrand(name: string) {
    if (!name || creating || disabled) return;
    setCreating(true);
    try {
      const id = await ensure({ name });
      const row = brands?.find((b) => b._id === id);
      onChange({ brandId: id, brandName: row?.name ?? name });
      setInputValue("");
    } catch (caught) {
      toast.error(reportError(caught).message);
    } finally {
      setCreating(false);
    }
  }

  const loading = brands === undefined;

  return (
    <Combobox
      items={options}
      value={selected}
      onValueChange={(next) => {
        if (!next) {
          onChange({ brandId: null, brandName: "" });
          setInputValue("");
          return;
        }
        if (next.id === "__create__") {
          void createBrand(next.name);
          return;
        }
        onChange({ brandId: next.id as Id<"brands">, brandName: next.name });
        setInputValue("");
      }}
      inputValue={selected && !inputValue ? selected.name : inputValue}
      onInputValueChange={(next) => {
        setInputValue(next);
        if (selected && next !== selected.name) {
          onChange({ brandId: null, brandName: "" });
        }
      }}
      itemToStringLabel={(item) => item.name}
      isItemEqualToValue={(a, b) => a.id === b.id}
      disabled={disabled || loading || creating}
      autoHighlight
    >
      <ComboboxInput
        className={cn(
          "h-10! w-full rounded-full! border-transparent! bg-muted shadow-none",
          "has-[[data-slot=input-group-control]:focus-visible]:border-foreground",
          "has-[[data-slot=input-group-control]:focus-visible]:bg-background",
          "has-[[data-slot=input-group-control]:focus-visible]:ring-2",
          "has-[[data-slot=input-group-control]:focus-visible]:ring-muted",
        )}
        placeholder={loading ? "Loading brands…" : "Search or create a brand"}
        disabled={disabled || loading || creating}
        showClear={Boolean(selected || inputValue)}
      />
      <ComboboxContent className="rounded-none">
        <ComboboxEmpty>No brands yet — type a name to create one.</ComboboxEmpty>
        <ComboboxList>
          {(item: BrandOption) =>
            item.id === "__create__" ? (
              <ComboboxItem key="__create__" value={item} className="border-t border-border">
                <Plus className="size-3.5" />
                <span className="truncate">
                  {creating ? "Creating…" : `Create “${item.name}”`}
                </span>
              </ComboboxItem>
            ) : (
              <ComboboxItem key={item.id} value={item}>
                <span className="min-w-0 flex-1 truncate font-medium">{item.name}</span>
                {item.slug ? (
                  <span className="ml-auto font-mono text-xs text-muted-foreground">{item.slug}</span>
                ) : null}
              </ComboboxItem>
            )
          }
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
