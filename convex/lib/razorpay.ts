import { optionalEnv, requireEnv } from "./env";
import { appError } from "./errors";

const RAZORPAY_API = "https://api.razorpay.com";

export function isRazorpayConfigured(): boolean {
  return Boolean(optionalEnv("RAZORPAY_KEY_ID") && optionalEnv("RAZORPAY_KEY_SECRET"));
}

export function requireRazorpayConfigured(): void {
  if (!isRazorpayConfigured()) {
    throw appError(
      "INVALID_INPUT",
      "Payments are not configured yet. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET on the Convex deployment.",
    );
  }
}

function authHeader(): string {
  const id = requireEnv("RAZORPAY_KEY_ID");
  const secret = requireEnv("RAZORPAY_KEY_SECRET");
  const token = `${id}:${secret}`;
  const bytes = new TextEncoder().encode(token);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `Basic ${btoa(binary)}`;
}

async function hmacHex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** `path` must include API version, e.g. `/v1/orders` or `/v2/accounts`. */
async function razorpayFetch<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  requireRazorpayConfigured();
  const response = await fetch(`${RAZORPAY_API}${path}`, {
    method: init.method ?? (init.body !== undefined ? "POST" : "GET"),
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
    },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
  const text = await response.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!response.ok) {
    const rawDescription =
      typeof json === "object" &&
      json !== null &&
      "error" in json &&
      typeof (json as { error?: { description?: string } }).error?.description === "string"
        ? (json as { error: { description: string } }).error.description
        : null;
    const message = rawDescription ?? `Razorpay request failed (${response.status}).`;
    if (/route feature not enabled/i.test(message)) {
      throw appError(
        "INVALID_INPUT",
        "Razorpay Route is not enabled on this merchant account. Ask Razorpay support to enable Route (Linked Accounts + Transfers) for Test Mode, then try again.",
      );
    }
    throw appError("UPSTREAM_FAILED", message);
  }
  return json as T;
}

export type RazorpayOrder = {
  id: string;
  amount: number;
  currency: string;
  status: string;
};

export async function createRazorpayOrder(args: {
  amountInr: number;
  receipt: string;
  notes?: Record<string, string>;
}): Promise<RazorpayOrder> {
  const amountPaise = Math.round(args.amountInr * 100);
  if (amountPaise < 100) {
    throw appError("INVALID_INPUT", "Order total must be at least ₹1.");
  }
  return razorpayFetch<RazorpayOrder>("/v1/orders", {
    body: {
      amount: amountPaise,
      currency: "INR",
      receipt: args.receipt.slice(0, 40),
      notes: args.notes ?? {},
    },
  });
}

export async function verifyPaymentSignature(args: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}): Promise<boolean> {
  const secret = requireEnv("RAZORPAY_KEY_SECRET");
  const payload = `${args.razorpayOrderId}|${args.razorpayPaymentId}`;
  const expected = await hmacHex(secret, payload);
  return safeEqualHex(expected, args.razorpaySignature);
}

export async function verifyWebhookSignature(
  rawBody: string,
  signature: string,
): Promise<boolean> {
  const secret = requireEnv("RAZORPAY_WEBHOOK_SECRET");
  const expected = await hmacHex(secret, rawBody);
  return safeEqualHex(expected, signature);
}

export type RazorpayLinkedAccount = {
  id: string;
  status?: string;
  product_config?: {
    activation_status?: string;
  };
};

function normalizeIndianPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  if (phone.startsWith("+") && digits.length >= 10) return `+${digits}`;
  return `+91${digits.slice(-10)}`;
}

/**
 * Create a Route linked account with bank settlement (composite v2 API).
 * @see https://razorpay.com/docs/api/payments/route/create-linked-account-composite
 */
export async function createLinkedAccount(args: {
  email: string;
  phone: string;
  legalBusinessName: string;
  businessType?: string;
  contactName: string;
  accountNumber: string;
  ifsc: string;
  beneficiaryName: string;
  referenceId: string;
  pan: string;
  gstin?: string;
}): Promise<RazorpayLinkedAccount> {
  const legalName = args.legalBusinessName.trim().slice(0, 200);
  const contactName = args.contactName.trim().slice(0, 255);
  if (legalName.length < 4) {
    throw appError("INVALID_INPUT", "Legal / store name must be at least 4 characters.");
  }
  if (contactName.length < 4) {
    throw appError("INVALID_INPUT", "Beneficiary name must be at least 4 characters.");
  }
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(args.pan.trim().toUpperCase())) {
    throw appError(
      "INVALID_INPUT",
      "Add a valid PAN on the store profile (Settings) before linking payouts.",
    );
  }

  return razorpayFetch<RazorpayLinkedAccount>("/v2/accounts", {
    body: {
      email: args.email,
      phone: normalizeIndianPhone(args.phone),
      type: "route",
      tnc_accepted: true,
      reference_id: args.referenceId.slice(0, 512),
      legal_business_name: legalName,
      business_type: args.businessType ?? "individual",
      contact_name: contactName,
      profile: {
        category: "fashion_and_lifestyle",
        subcategory: "fashion",
        addresses: {
          registered: {
            street1: "Registered address",
            city: "Bengaluru",
            state: "KARNATAKA",
            postal_code: "560001",
            country: "IN",
          },
        },
      },
      legal_info: {
        pan: args.pan.trim().toUpperCase(),
        ...(args.gstin ? { gst: args.gstin.trim().toUpperCase() } : {}),
      },
      settlement_accounts: [
        {
          method: "bank_account",
          bank_account: {
            account_number: args.accountNumber,
            beneficiary_name: args.beneficiaryName.trim(),
            code_type: "ifsc",
            code: args.ifsc.trim().toUpperCase(),
            currency: "INR",
            is_default: true,
          },
        },
      ],
    },
  });
}

/** Map Razorpay linked-account response to our payoutStatus. */
export function payoutStatusFromLinkedAccount(
  account: RazorpayLinkedAccount,
): "pending" | "activated" | "rejected" {
  if (account.status === "suspended") return "rejected";
  const product = account.product_config?.activation_status;
  if (product === "activated" || account.status === "activated") return "activated";
  return "pending";
}

export type RazorpayTransfer = {
  id: string;
  status: string;
  amount: number;
};

export async function createTransfer(args: {
  account: string;
  amountInr: number;
  notes?: Record<string, string>;
}): Promise<RazorpayTransfer> {
  const amountPaise = Math.round(args.amountInr * 100);
  if (amountPaise < 100) {
    throw appError("INVALID_INPUT", "Transfer amount must be at least ₹1.");
  }
  return razorpayFetch<RazorpayTransfer>("/v1/transfers", {
    body: {
      account: args.account,
      amount: amountPaise,
      currency: "INR",
      notes: args.notes ?? {},
    },
  });
}

export type RazorpayRefund = {
  id: string;
  amount: number;
  status: string;
};

export async function createRefund(args: {
  paymentId: string;
  amountInr?: number;
  notes?: Record<string, string>;
}): Promise<RazorpayRefund> {
  const body: Record<string, unknown> = {
    notes: args.notes ?? {},
  };
  if (args.amountInr !== undefined) {
    body.amount = Math.round(args.amountInr * 100);
  }
  return razorpayFetch<RazorpayRefund>(`/v1/payments/${args.paymentId}/refund`, { body });
}

export type RazorpayCustomer = {
  id: string;
  email?: string;
};

export async function createCustomer(args: {
  name: string;
  email: string;
  contact?: string;
  notes?: Record<string, string>;
}): Promise<RazorpayCustomer> {
  return razorpayFetch<RazorpayCustomer>("/v1/customers", {
    body: {
      name: args.name,
      email: args.email,
      ...(args.contact ? { contact: args.contact } : {}),
      notes: args.notes ?? {},
      fail_existing: "0",
    },
  });
}

export type RazorpayPlan = {
  id: string;
};

export async function createPlan(args: {
  period: "monthly";
  interval: number;
  amountInr: number;
  name: string;
}): Promise<RazorpayPlan> {
  return razorpayFetch<RazorpayPlan>("/v1/plans", {
    body: {
      period: args.period,
      interval: args.interval,
      item: {
        name: args.name,
        amount: Math.round(args.amountInr * 100),
        currency: "INR",
      },
    },
  });
}

export type RazorpaySubscription = {
  id: string;
  status: string;
  short_url?: string;
  current_end?: number;
};

export async function createSubscription(args: {
  planId: string;
  customerId: string;
  totalCount?: number;
  notes?: Record<string, string>;
}): Promise<RazorpaySubscription> {
  return razorpayFetch<RazorpaySubscription>("/v1/subscriptions", {
    body: {
      plan_id: args.planId,
      customer_id: args.customerId,
      total_count: args.totalCount ?? 120,
      customer_notify: 1,
      notes: args.notes ?? {},
    },
  });
}

export async function cancelSubscription(subscriptionId: string): Promise<RazorpaySubscription> {
  return razorpayFetch<RazorpaySubscription>(`/v1/subscriptions/${subscriptionId}/cancel`, {
    body: { cancel_at_cycle_end: 0 },
  });
}

export function publicKeyId(): string {
  return requireEnv("RAZORPAY_KEY_ID");
}
