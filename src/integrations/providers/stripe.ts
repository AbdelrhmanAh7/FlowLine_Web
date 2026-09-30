import { z } from "zod";
import { ProviderError, type ActionDef, type Credentials, type ProviderDef } from "../types";

function assertTestKey(creds: Credentials): void {
  const token = creds.token ?? "";
  if (!token.startsWith("sk_test_") && !token.startsWith("rk_test_")) {
    throw new ProviderError("client", "Only Stripe test-mode keys are allowed");
  }
}

const FORM_HEADERS = { "content-type": "application/x-www-form-urlencoded" };

function formBody(params: Record<string, string>): string {
  return new URLSearchParams(params).toString();
}

const listInput = z.object({ limit: z.number().int().min(1).max(100).default(10) });
const listOutput = z.object({
  charges: z
    .array(
      z.object({
        id: z.string(),
        amount: z.number().int(),
        currency: z.string(),
        status: z.string(),
        created: z.number().int(),
      }),
    )
    .max(100),
  has_more: z.boolean(),
});

interface ChargeList {
  data: { id: string; amount: number; currency: string; status: string; created: number }[];
  has_more: boolean;
}

const listCharges: ActionDef<z.infer<typeof listInput>, z.infer<typeof listOutput>> = {
  id: "stripe.list_charges",
  version: 1,
  provider: "stripe",
  title: "List charges",
  description: "List recent charges on the account",
  input: listInput,
  output: listOutput,
  sideEffect: "none",
  requiredScopes: ["charges:read"],
  async run(ctx, input) {
    assertTestKey(ctx.credentials);
    const res = await ctx.http.request<ChargeList>({ method: "GET", path: "/v1/charges", query: { limit: input.limit } });
    return { charges: res.data.data.slice(0, 100), has_more: res.data.has_more };
  },
};

const refundInput = z.object({
  charge: z.string().min(1).max(64),
  amount: z.number().int().positive().optional(),
});
const refundOutput = z.object({
  id: z.string(),
  amount: z.number().int(),
  currency: z.string(),
  status: z.string().nullable(),
  charge: z.string(),
});

const createRefund: ActionDef<z.infer<typeof refundInput>, z.infer<typeof refundOutput>> = {
  id: "stripe.create_refund",
  version: 1,
  provider: "stripe",
  title: "Create refund",
  description: "Refund a charge, fully or partially",
  input: refundInput,
  output: refundOutput,
  sideEffect: "idempotent",
  sensitive: true,
  requiredScopes: ["refunds:write"],
  async run(ctx, input) {
    assertTestKey(ctx.credentials);
    const res = await ctx.http.request<z.infer<typeof refundOutput>>({
      method: "POST",
      path: "/v1/refunds",
      headers: { ...FORM_HEADERS, "Idempotency-Key": ctx.idempotencyKey },
      body: formBody({ charge: input.charge, ...(input.amount !== undefined ? { amount: String(input.amount) } : {}) }),
    });
    return res.data;
  },
};

const provider: ProviderDef = {
  id: "stripe",
  name: "Stripe",
  icon: "💳",
  category: "Payments",
  description: "List charges and create refunds (test mode only)",
  authType: "api_key",
  apiBase: "https://api.stripe.com",
  connectFields: [{ key: "token", label: "Secret key (test mode only)", secret: true, placeholder: "sk_test_… or rk_test_…" }],
  async identity(ctx) {
    assertTestKey(ctx.credentials);
    const res = await ctx.http.request<{ id: string; email?: string | null; business_profile?: { name?: string | null } | null }>({
      method: "GET",
      path: "/v1/account",
    });
    const acct = res.data;
    return { accountId: acct.id, label: acct.email ?? acct.business_profile?.name ?? acct.id };
  },
  actions: [listCharges, createRefund],
  verification: {
    adapter: true,
    betaScope: "deferred",
    contractTested: true,
    live: "blocked",
    liveNote: "Needs a sandbox account/credentials (none configured)",
  },
};

export default provider;
