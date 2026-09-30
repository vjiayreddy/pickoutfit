"use client";

import { useMutation, useQuery } from "convex/react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useVendor } from "@/components/vendor/VendorDesk";
import { profileArgs, VendorProfileForm, type VendorProfileValues } from "@/components/vendor/VendorProfileForm";
import { useUpload } from "@/hooks/use-upload";
import { reportError } from "@/lib/client-errors";
import { formatDate } from "@/lib/format";
import { routes } from "@/lib/routes";

export function VendorSettings() {
  const me = useVendor();
  const { vendor } = me;
  const updateProfile = useMutation(api.vendors.updateProfile);

  const initial: VendorProfileValues = {
    name: vendor.name,
    description: vendor.description ?? "",
    supportEmail: vendor.supportEmail,
    supportPhone: vendor.supportPhone ?? "",
    legalName: vendor.legalName ?? "",
    gstin: vendor.gstin ?? "",
    pan: vendor.pan ?? "",
    address: {
      line1: vendor.address.line1,
      line2: vendor.address.line2 ?? "",
      city: vendor.address.city,
      state: vendor.address.state,
      pincode: vendor.address.pincode,
      country: vendor.address.country,
    },
  };

  return (
    <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-12">
        <Branding />
        <VendorProfileForm
          key={vendor.createdAt}
          initial={initial}
          submitLabel="Save changes"
          onSubmit={async (values) => {
            try {
              await updateProfile(profileArgs(values));
              toast.success("Store details saved.");
            } catch (error) {
              throw new Error(reportError(error).message);
            }
          }}
        />
        {me.membership.role === "owner" ? <Members /> : null}
      </div>
      <aside className="space-y-6 lg:sticky lg:top-20 lg:self-start">
        <div className="space-y-2 border border-hairline p-4 text-sm">
          <p className="font-medium">Plan</p>
          <p>
            {me.planName} · {(vendor.commissionBps / 100).toFixed(1)}% commission
          </p>
          <p className="text-mute">{me.planBlurb}</p>
          <p className="text-mute">
            {vendor.planStatus === "trial" ? "Trial" : vendor.planStatus === "active" ? "Active" : vendor.planStatus === "past_due" ? "Payment overdue" : "Cancelled"}
            {vendor.planPeriodEnd ? ` · renews ${formatDate(vendor.planPeriodEnd)}` : ""}
          </p>
          <Button href={routes.vendorBilling} variant="secondary" size="sm">
            Billing
          </Button>
        </div>
        <div className="space-y-2 border border-hairline p-4 text-sm">
          <p className="font-medium">Storefront</p>
          <p className="break-all text-mute">/store/{vendor.slug}</p>
          <p className="text-mute">Store code {vendor.code}</p>
        </div>
      </aside>
    </div>
  );
}

function Branding() {
  const { vendor } = useVendor();
  const setBranding = useMutation(api.vendors.setBranding);
  const { upload, isUploading } = useUpload("vendor");

  async function pick(kind: "logo" | "banner", file: File | undefined) {
    if (!file) return;
    try {
      const storageId = await upload(file, kind);
      await setBranding(kind === "logo" ? { logoStorageId: storageId } : { bannerStorageId: storageId });
      toast.success(kind === "logo" ? "Logo updated." : "Banner updated.");
    } catch (error) {
      toast.error(reportError(error).message);
    }
  }

  return (
    <section className="space-y-4">
      <h2 className="text-sm font-medium">Branding</h2>
      <div className="relative aspect-[3/1] bg-soft-cloud">
        {vendor.bannerUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={vendor.bannerUrl} alt="" className="h-full w-full object-cover" />
        ) : null}
        <label className="absolute right-3 bottom-3 inline-flex h-10 cursor-pointer items-center rounded-full bg-canvas px-4 text-sm font-medium">
          {isUploading ? "Uploading…" : vendor.bannerUrl ? "Change banner" : "Add banner"}
          <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => void pick("banner", e.target.files?.[0])} />
        </label>
        <label className="absolute bottom-3 left-3 block size-20 cursor-pointer overflow-hidden rounded-full bg-canvas ring-4 ring-canvas">
          {vendor.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={vendor.logoUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full items-center justify-center text-xs font-medium text-mute">Logo</span>
          )}
          <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => void pick("logo", e.target.files?.[0])} />
        </label>
      </div>
    </section>
  );
}

function Members() {
  const members = useQuery(api.vendors.listMembers, {});
  const invite = useMutation(api.vendors.inviteMember);
  const remove = useMutation(api.vendors.removeMember);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"manager" | "staff">("staff");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    try {
      await invite({ email, role });
      toast.success("Added to the store.");
      setEmail("");
    } catch (error) {
      toast.error(reportError(error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="space-y-4 border-t border-hairline pt-8">
      <div>
        <h2 className="text-sm font-medium">Team</h2>
        <p className="mt-1 text-sm text-mute">Managers can edit anything except the team. Staff can add and edit products.</p>
      </div>
      <ul className="divide-y divide-hairline border-y border-hairline">
        {members?.map((member) => (
          <li key={member._id} className="flex items-center gap-3 py-3 text-sm">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{member.name ?? member.email ?? "Member"}</p>
              <p className="truncate text-xs text-mute">{member.email}</p>
            </div>
            <span className="rounded-full bg-soft-cloud px-3 py-1 text-xs font-medium capitalize">{member.role}</span>
            {member.role !== "owner" ? (
              <ConfirmDialog trigger={<Button variant="ghost" size="sm">Remove</Button>} title={`Remove ${member.name ?? member.email}?`} confirmLabel="Remove" destructive onConfirm={() => remove({ memberId: member._id })} />
            ) : null}
          </li>
        ))}
      </ul>
      <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
        <Input type="email" required placeholder="teammate@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className="flex-1" />
        <select value={role} onChange={(e) => setRole(e.target.value as "manager" | "staff")} className="h-12 rounded-full bg-soft-cloud px-4 text-sm">
          <option value="staff">Staff</option>
          <option value="manager">Manager</option>
        </select>
        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add"}
        </Button>
      </form>
      <p className="text-xs text-mute">They need a WardrobeAI account with that email first.</p>
    </section>
  );
}
