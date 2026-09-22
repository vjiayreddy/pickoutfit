"use client";

import { useAction, useConvexAuth, useQuery } from "convex/react";
import { Images } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import { ErrorAlert } from "@/components/common/ErrorAlert";
import { ItemImage } from "@/components/common/ItemImage";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { reportError } from "@/lib/client-errors";
import { cn } from "@/lib/cn";
import { pluralize } from "@/lib/format";

type Wardrobe = "men" | "women";

function defaultWardrobe(presentation: string | undefined): Wardrobe | null {
  if (presentation === "masculine") return "men";
  if (presentation === "feminine") return "women";
  return null;
}

export function SeedDemoWardrobe({
  onSeeded,
  variant = "ghost",
}: {
  onSeeded?: () => void;
  variant?: "ghost" | "secondary";
}) {
  const seed = useAction(api.demoWardrobe.seed);
  const { isAuthenticated } = useConvexAuth();
  const me = useQuery(api.users.me);
  const id = useId();
  const [open, setOpen] = useState(false);
  const [wardrobe, setWardrobe] = useState<Wardrobe | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSeed() {
    if (!wardrobe) return;
    setPending(true);
    setError(null);
    try {
      const { added, removed } = await seed({ wardrobe });
      onSeeded?.();
      setOpen(false);
      toast.success(
        added > 0 || removed > 0
          ? `${pluralize(added, "demo item")} added. No credits used.`
          : "This demo wardrobe is already added.",
      );
    } catch (caught) {
      setError(reportError(caught, "Could not add the demo wardrobe. Try again.").message);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
        if (next) {
          setWardrobe(defaultWardrobe(me?.prefs.presentation));
          setError(null);
        }
      }}
    >
      <DialogTrigger
        render={
          <Button
            variant={variant}
            size="sm"
            className="h-10 rounded-full px-4"
            disabled={!isAuthenticated}
          >
            <Images />
            Seed demo wardrobe
          </Button>
        }
      />
      <DialogContent className="max-w-xl!">
        <DialogHeader>
          <DialogTitle>Choose a demo wardrobe</DialogTitle>
          <DialogDescription>
            Eight adult pieces to try WardrobeAI. Free to add. Your own uploads stay.
          </DialogDescription>
        </DialogHeader>
        <fieldset className="grid grid-cols-2 gap-3" disabled={pending}>
          <legend className="sr-only">Demo wardrobe</legend>
          {(["men", "women"] as const).map((choice) => (
            <label
              key={choice}
              htmlFor={`${id}-${choice}`}
              className={cn(
                "relative cursor-pointer border p-3 transition-colors",
                wardrobe === choice ? "border-ink bg-soft-cloud" : "border-hairline bg-canvas",
              )}
            >
              <span className="grid w-full grid-cols-2 gap-1" aria-hidden>
                <ItemImage
                  src={
                    choice === "men"
                      ? "/demo-wardrobe/mens-cotton-jacket.png"
                      : "/demo-wardrobe/womens-leather-jacket.png"
                  }
                  alt=""
                  aspect="aspect-[3/4]"
                  className="bg-transparent"
                />
                <ItemImage
                  src={
                    choice === "men"
                      ? "/demo-wardrobe/blue-jeans.png"
                      : "/demo-wardrobe/black-evening-gown.webp"
                  }
                  alt=""
                  aspect="aspect-[3/4]"
                  className="bg-transparent"
                />
              </span>
              <span className="mt-4 flex w-full items-center gap-2.5 text-sm font-medium">
                <input
                  id={`${id}-${choice}`}
                  type="radio"
                  name={`${id}-wardrobe`}
                  value={choice}
                  checked={wardrobe === choice}
                  onChange={() => setWardrobe(choice)}
                  className="size-4 accent-ink"
                />
                {choice === "men" ? "Men’s wardrobe" : "Women’s wardrobe"}
              </span>
            </label>
          ))}
        </fieldset>
        <p className="text-xs leading-relaxed text-mute">
          Choosing a different collection replaces previously seeded demo pieces. Only the selected
          collection is added.
        </p>
        {error ? <ErrorAlert message={error} /> : null}
        <DialogFooter>
          <Button variant="outline" size="sm" disabled={pending} onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button size="sm" disabled={pending || !wardrobe} onClick={() => void handleSeed()}>
            {pending ? <Spinner /> : <Images />}
            {pending
              ? "Adding demo wardrobe…"
              : wardrobe
                ? `Seed ${wardrobe === "men" ? "men's" : "women's"} wardrobe`
                : "Choose a wardrobe"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
