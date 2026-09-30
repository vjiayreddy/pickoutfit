"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export type VendorProfileValues = {
  name: string;
  description: string;
  supportEmail: string;
  supportPhone: string;
  legalName: string;
  gstin: string;
  pan: string;
  address: { line1: string; line2: string; city: string; state: string; pincode: string; country: string };
};

export const EMPTY_PROFILE: VendorProfileValues = {
  name: "",
  description: "",
  supportEmail: "",
  supportPhone: "",
  legalName: "",
  gstin: "",
  pan: "",
  address: { line1: "", line2: "", city: "", state: "", pincode: "", country: "IN" },
};

/** Trims and drops blanks so optional fields go up as `undefined`, not `""`. */
export function profileArgs(values: VendorProfileValues) {
  const opt = (value: string) => (value.trim() ? value.trim() : undefined);
  return {
    name: values.name.trim(),
    description: opt(values.description),
    supportEmail: values.supportEmail.trim(),
    supportPhone: opt(values.supportPhone),
    legalName: opt(values.legalName),
    gstin: opt(values.gstin),
    pan: opt(values.pan),
    address: {
      line1: values.address.line1.trim(),
      line2: opt(values.address.line2),
      city: values.address.city.trim(),
      state: values.address.state.trim(),
      pincode: values.address.pincode.trim(),
      country: values.address.country.trim() || "IN",
    },
  };
}

export function VendorProfileForm({
  initial,
  submitLabel,
  onSubmit,
  footer,
}: {
  initial: VendorProfileValues;
  submitLabel: string;
  onSubmit: (values: VendorProfileValues) => Promise<void>;
  footer?: ReactNode;
}) {
  const [values, setValues] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof VendorProfileValues>(key: K, value: VendorProfileValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }
  function setAddress<K extends keyof VendorProfileValues["address"]>(key: K, value: string) {
    setValues((current) => ({ ...current, address: { ...current.address, [key]: value } }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await onSubmit(values);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <section className="space-y-4">
        <h2 className="text-sm font-medium">Store</h2>
        <Field label="Store name">
          <Input required maxLength={60} value={values.name} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label="About the store">
          <Textarea
            rows={3}
            maxLength={600}
            value={values.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="What you make, who it's for."
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Support email">
            <Input
              type="email"
              required
              value={values.supportEmail}
              onChange={(e) => set("supportEmail", e.target.value)}
            />
          </Field>
          <Field label="Support phone">
            <Input value={values.supportPhone} onChange={(e) => set("supportPhone", e.target.value)} />
          </Field>
        </div>
      </section>

      <section className="space-y-4 border-t border-hairline pt-8">
        <div>
          <h2 className="text-sm font-medium">Business</h2>
          <p className="mt-1 text-sm text-mute">Needed before payouts can be enabled. You can fill this in later.</p>
        </div>
        <Field label="Legal name">
          <Input maxLength={120} value={values.legalName} onChange={(e) => set("legalName", e.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="GSTIN">
            <Input
              maxLength={15}
              value={values.gstin}
              onChange={(e) => set("gstin", e.target.value.toUpperCase())}
              placeholder="22AAAAA0000A1Z5"
            />
          </Field>
          <Field label="PAN">
            <Input
              maxLength={10}
              value={values.pan}
              onChange={(e) => set("pan", e.target.value.toUpperCase())}
              placeholder="AAAAA0000A"
            />
          </Field>
        </div>
      </section>

      <section className="space-y-4 border-t border-hairline pt-8">
        <h2 className="text-sm font-medium">Pickup address</h2>
        <Field label="Address line 1">
          <Input required value={values.address.line1} onChange={(e) => setAddress("line1", e.target.value)} />
        </Field>
        <Field label="Address line 2">
          <Input value={values.address.line2} onChange={(e) => setAddress("line2", e.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="City">
            <Input required value={values.address.city} onChange={(e) => setAddress("city", e.target.value)} />
          </Field>
          <Field label="State">
            <Input required value={values.address.state} onChange={(e) => setAddress("state", e.target.value)} />
          </Field>
          <Field label="PIN code">
            <Input
              required
              inputMode="numeric"
              maxLength={6}
              value={values.address.pincode}
              onChange={(e) => setAddress("pincode", e.target.value)}
            />
          </Field>
        </div>
      </section>

      {error ? <p className="text-sm text-sale">{error}</p> : null}
      <div className="flex flex-wrap items-center gap-3 border-t border-hairline pt-8">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
        {footer}
      </div>
    </form>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block space-y-1 text-sm font-medium">
      {label}
      {children}
      {hint ? <span className="block text-xs font-normal text-mute">{hint}</span> : null}
    </label>
  );
}
