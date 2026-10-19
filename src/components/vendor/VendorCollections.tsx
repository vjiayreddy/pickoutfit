"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { FolderOpen, Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/vendor/VendorProfileForm";
import { useUpload } from "@/hooks/use-upload";
import { reportError } from "@/lib/client-errors";
import { formatInr } from "@/lib/format";

type CollectionView = FunctionReturnType<typeof api.vendorCollections.list>[number];

export function VendorCollections() {
  const collections = useQuery(api.vendorCollections.list, {});
  const remove = useMutation(api.vendorCollections.remove);
  const [editing, setEditing] = useState<CollectionView | "new" | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-mute">Group pieces into drops, capsules or seasons. Shoppers see them on your storefront.</p>
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus />
          New collection
        </Button>
      </div>

      {collections === undefined ? (
        <div className="h-40 animate-pulse bg-soft-cloud" />
      ) : collections.length === 0 ? (
        <EmptyState icon={FolderOpen} title="No collections yet" description="A collection is a hand-picked set of your products with its own cover." action={<Button onClick={() => setEditing("new")}>New collection</Button>} />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {collections.map((collection) => (
            <li key={collection.id} className="space-y-2">
              <div className="relative aspect-[4/3] bg-soft-cloud">
                {collection.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={collection.coverUrl} alt="" className="h-full w-full object-cover" />
                ) : null}
                {!collection.active ? <span className="absolute top-2 left-2 rounded-full bg-canvas px-2.5 py-1 text-[11px] font-medium text-mute">Hidden</span> : null}
              </div>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{collection.name}</p>
                  <p className="text-xs text-mute">{collection.productIds.length} products</p>
                </div>
                <div className="flex gap-1">
                  <Button variant="secondary" size="sm" onClick={() => setEditing(collection)}>
                    Edit
                  </Button>
                  <ConfirmDialog trigger={<Button variant="ghost" size="sm">Delete</Button>} title="Delete this collection?" confirmLabel="Delete" destructive onConfirm={() => remove({ collectionId: collection.id })} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing ? <CollectionDialog collection={editing === "new" ? null : editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function CollectionDialog({ collection, onClose }: { collection: CollectionView | null; onClose: () => void }) {
  const create = useMutation(api.vendorCollections.create);
  const update = useMutation(api.vendorCollections.update);
  const products = useQuery(api.vendorProducts.list, { paginationOpts: { numItems: 200, cursor: null } });
  const { upload, isUploading } = useUpload("vendor");
  const [name, setName] = useState(collection?.name ?? "");
  const [description, setDescription] = useState(collection?.description ?? "");
  const [active, setActive] = useState(collection?.active ?? true);
  const [productIds, setProductIds] = useState<Id<"products">[]>(collection?.productIds ?? []);
  const [cover, setCover] = useState<{ storageId?: Id<"_storage">; url: string | null }>({ url: collection?.coverUrl ?? null });
  const [pending, setPending] = useState(false);

  async function pickCover(file: File | undefined) {
    if (!file) return;
    try {
      const storageId = await upload(file, "cover");
      setCover({ storageId, url: URL.createObjectURL(file) });
    } catch (error) {
      toast.error(reportError(error).message);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending || isUploading) return;
    setPending(true);
    try {
      const args = {
        name,
        description: description.trim() || undefined,
        // Keep the existing cover unless a new one was uploaded; the server reads `undefined` as "none".
        coverStorageId: cover.storageId ?? (cover.url ? collection?.coverStorageId ?? undefined : undefined),
        productIds,
        active,
      };
      if (collection) await update({ collectionId: collection.id, ...args });
      else await create(args);
      toast.success(collection ? "Collection updated." : "Collection created.");
      onClose();
    } catch (error) {
      toast.error(reportError(error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{collection ? "Edit collection" : "New collection"}</DialogTitle>
          </DialogHeader>
          <div className="flex gap-4">
            <label className="relative block aspect-square w-28 shrink-0 cursor-pointer bg-soft-cloud">
              {cover.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={cover.url} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full items-center justify-center text-center text-xs text-mute">Cover</span>
              )}
              <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => void pickCover(e.target.files?.[0])} />
            </label>
            <div className="flex-1 space-y-3">
              <Field label="Name">
                <Input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="Monsoon capsule" />
              </Field>
              <label className="flex h-10 items-center justify-between rounded-full bg-soft-cloud px-4 text-sm font-medium">
                Shown on storefront
                <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="size-5 accent-ink" />
              </label>
            </div>
          </div>
          <Field label="Description">
            <Textarea rows={2} maxLength={600} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <div className="space-y-2">
            <p className="text-sm font-medium">Products ({productIds.length})</p>
            <ul className="max-h-56 space-y-1 overflow-y-auto border border-hairline p-2">
              {products?.page.map((product) => {
                const on = productIds.includes(product.id);
                return (
                  <li key={product.id}>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={on} onChange={() => setProductIds(on ? productIds.filter((id) => id !== product.id) : [...productIds, product.id])} className="size-4 accent-ink" />
                      <span className="size-8 shrink-0 bg-soft-cloud">
                        {product.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={product.imageUrl} alt="" className="h-full w-full object-cover" />
                        ) : null}
                      </span>
                      <span className="truncate">{product.name}</span>
                      <span className="ml-auto text-xs text-mute">{formatInr(product.priceInr)}</span>
                    </label>
                  </li>
                );
              })}
              {products && products.page.length === 0 ? <li className="p-2 text-sm text-mute">Add products first.</li> : null}
            </ul>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || isUploading}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
