"use client";

import { useMutation } from "convex/react";
import { TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { routes } from "@/lib/routes";

const CONFIRM_PHRASE = "DELETE";

export function DangerZone() {
  const router = useRouter();
  const deleteAllData = useMutation(api.users.deleteAllData);
  const [typed, setTyped] = useState("");

  async function handleDelete() {
    await deleteAllData({ confirm: CONFIRM_PHRASE });
    await authClient.signOut();
    router.replace(routes.home);
    router.refresh();
  }

  return (
    <section
      id="data"
      className="grid scroll-mt-40 gap-6 border-t border-hairline py-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-10"
    >
      <header className="space-y-2">
        <p className="font-mono text-[10px] tracking-[0.16em] text-mute uppercase">
          04 / Your data
        </p>
        <h2 className="flex items-center gap-2 text-xl font-medium tracking-tight">
          <TriangleAlert className="size-4" aria-hidden />
          Wardrobe data
        </h2>
        <p className="text-sm text-mute">Manage the content stored in your account.</p>
      </header>
      <div className="space-y-4">
        <p className="max-w-xl text-sm leading-relaxed text-mute">
          Deleting removes your wardrobe, outfits, renders, photos and conversations permanently.
          Your account, subscription, credit balance and credit history are kept.
        </p>
        <ConfirmDialog
          trigger={<Button variant="destructive">Delete wardrobe data</Button>}
          title="Delete your wardrobe data?"
          description="Every item, outfit, render, avatar and conversation is erased, then you are signed out. Your subscription and credits stay available."
          confirmLabel="Delete wardrobe data"
          destructive
          confirmDisabled={typed.trim() !== CONFIRM_PHRASE}
          onOpenChange={(open) => !open && setTyped("")}
          onConfirm={handleDelete}
        >
          <div className="space-y-2">
            <label htmlFor="confirm-delete" className="text-sm font-medium">
              Type {CONFIRM_PHRASE} to confirm
            </label>
            <Input
              id="confirm-delete"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              placeholder={CONFIRM_PHRASE}
            />
            <p className="text-sm text-mute">
              This wipes your account data. Your sign-in stays, so you can start again.
            </p>
          </div>
        </ConfirmDialog>
      </div>
    </section>
  );
}
