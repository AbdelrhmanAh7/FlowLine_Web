import { z } from "zod";
import { checkUrl, EgressError } from "@/server/egress";
import { ProviderError, type Credentials, type ProviderDef } from "../types";
import { toDecimalString } from "@/lib/format";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONEY = /^\d+\.\d{2}$/;

// The Mizano host is per workspace (a connect setting, not a secret). Only a public https origin is accepted so the
// scoped API key is never sent anywhere but the Mizano host the user typed. checkUrl is the same guard safeFetch
// applies to every request, so private, loopback, link-local and internal hosts are refused before a request is built.
function base(creds: Credentials): string {
  const raw = creds.settings?.baseUrl;
  if (!raw) throw new ProviderError("client", "Mizano base URL is missing");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ProviderError("client", "Mizano base URL must be a full https URL");
  }
  if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash) {
    throw new ProviderError("client", "Mizano base URL must be an https origin with no path");
  }
  try {
    checkUrl(url);
  } catch (e) {
    if (e instanceof EgressError) throw new ProviderError("egress_blocked", `Mizano base URL refused: ${e.message}`);
    throw e;
  }
  return url.origin;
}

const mizanoIdentity = z.object({
  id: z.string().min(1).max(128),
  workspaceName: z.string().min(1).max(200),
});

const mizanoInvoice = z.object({
  number: z.string(),
  customerName: z.string(),
  balanceDue: z.string().regex(MONEY),
  dueDate: z.string().regex(DATE),
});

const _mizanoCustomerSchema = z.object({
  id: z.string(),
  name: z.string(),
  company: z.string(),
  email: z.string(),
  phone: z.string(),
  taxId: z.string().optional(),
});
type MizanoCustomer = z.infer<typeof _mizanoCustomerSchema>;

const decimalString = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, "must be a decimal string with up to 2 decimal places");

// Accepts a number or a decimal string, normalizes to a fixed-scale (2) decimal string.
// Rejects negative values, non-decimal values, or excess precision for qty, unitPrice, taxRate.
// Uses ctx.addIssue and returns z.NEVER so validation errors are reported cleanly without throwing
// raw Errors from transform (which escapes safeParse/parse and causes unhandled 500 crashes).
export const moneyInput = z.union([z.number(), z.string()]).transform((val, ctx) => {
  try {
    const result = toDecimalString(val, 2);
    if (result.startsWith("-")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "must be a positive decimal string with up to 2 decimal places",
      });
      return z.NEVER;
    }
    return result;
  } catch (err) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: err instanceof Error ? err.message : "must be a valid decimal string with up to 2 decimal places",
    });
    return z.NEVER;
  }
});

const provider: ProviderDef = {
  id: "mizano",
  name: "Mizano",
  icon: "📒",
  category: "Finance",
  description: "Mizano accounting connector.",
  authType: "api_key",
  apiBase: "",
  connectFields: [
    { key: "token", label: "Scoped API key", secret: true },
    { key: "baseUrl", label: "Mizano URL", secret: false, placeholder: "https://mizano.example.com" },
  ],
  async identity(ctx) {
    const { data } = await ctx.http.request<unknown>({
      method: "GET",
      path: "/api/me",
      baseUrl: base(ctx.credentials),
    });
    const me = mizanoIdentity.parse(data);
    return { accountId: me.id, label: me.workspaceName };
  },
  actions: [
    {
      id: "mizano.list_overdue_invoices",
      version: 1,
      provider: "mizano",
      title: "List overdue invoices",
      description: "List unpaid invoices past their due date on the date you choose, in the workspace currency.",
      input: z.object({
        asOf: z.string().regex(DATE).optional(),
      }),
      output: z.object({
        asOf: z.string().regex(DATE),
        currency: z.string().regex(/^[A-Z]{3}$/),
        invoices: z
          .array(
            z.object({
              number: z.string(),
              customer: z.string(),
              amount: z.string().regex(MONEY),
              dueDate: z.string().regex(DATE),
              paid: z.boolean(),
            }),
          )
          .max(500),
      }),
      sideEffect: "none",
      requiredScopes: ["invoices:read"],
      async run(ctx, input) {
        const asOf = input.asOf ?? new Date().toISOString().slice(0, 10);
        const { data } = await ctx.http.request<{ currency: string; invoices: z.infer<typeof mizanoInvoice>[] }>({
          method: "GET",
          path: "/api/invoices",
          baseUrl: base(ctx.credentials),
          query: { status: "overdue", asOf },
        });
        const invoices = z.array(mizanoInvoice).max(500).parse(data.invoices);
        return {
          asOf,
          currency: data.currency,
          invoices: invoices.map((i) => ({
            number: i.number,
            customer: i.customerName,
            amount: i.balanceDue,
            dueDate: i.dueDate,
            paid: i.balanceDue === "0.00",
          })),
        };
      },
    },
    {
      id: "mizano.create_customer",
      version: 1,
      provider: "mizano",
      title: "Create customer",
      description: "Create a new customer in Mizano with name, company, email, phone, and optional taxId.",
      input: z.object({
        name: z.string().min(1).max(200),
        company: z.string().min(1).max(200),
        email: z.string().email(),
        phone: z.string().min(1).max(50),
        taxId: z.string().max(50).optional(),
      }),
      output: z.object({
        id: z.string(),
        name: z.string(),
        company: z.string(),
        email: z.string(),
        phone: z.string(),
        taxId: z.string().optional(),
      }),
      // "non_idempotent": the POST carries the engine's per-(run, node) Idempotency-Key, but Mizano honouring it is
      // unverified until MZ G5 ships, so the engine must not retry blindly after an unknown outcome. Switch to
      // "idempotent" once the key is confirmed.
      sideEffect: "non_idempotent",
      requiredScopes: ["customers:create"],
      async run(ctx, input) {
        const idempotencyKey = ctx.idempotencyKey;
        const { data } = await ctx.http.request<MizanoCustomer>({
          method: "POST",
          path: "/api/customers",
          baseUrl: base(ctx.credentials),
          headers: {
            "Idempotency-Key": idempotencyKey,
          },
          json: {
            name: input.name,
            company: input.company,
            email: input.email,
            phone: input.phone,
            ...(input.taxId !== undefined && { taxId: input.taxId }),
          },
        });
        return data as MizanoCustomer;
      },
    },
    {
      id: "mizano.create_draft_quote",
      version: 1,
      provider: "mizano",
      title: "Create draft quote",
      description: "Create a draft quote in Mizano with a customer and line items (currency, lines with item, qty, unitPrice, taxRate). Money values are normalized to fixed-scale decimal strings.",
      input: z.object({
        customerId: z.string().min(1).max(200),
        currency: z.string().regex(/^[A-Z]{3}$/),
        lines: z.array(
          z.object({
            item: z.string().min(1).max(200),
            qty: moneyInput,
            unitPrice: moneyInput,
            taxRate: moneyInput,
          }),
        ).min(1).max(200),
      }),
      output: z.object({
        id: z.string(),
        customerId: z.string(),
        currency: z.string().regex(/^[A-Z]{3}$/),
        lines: z.array(
          z.object({
            item: z.string(),
            qty: decimalString,
            unitPrice: decimalString,
            taxRate: decimalString,
          }),
        ),
      }),
      // "non_idempotent" for the same reason as mizano.create_customer.
      sideEffect: "non_idempotent",
      requiredScopes: ["quotes:create"],
      async run(ctx, input) {
        const idempotencyKey = ctx.idempotencyKey;
        const { data } = await ctx.http.request({
          method: "POST",
          path: "/api/quotes",
          baseUrl: base(ctx.credentials),
          headers: {
            "Idempotency-Key": idempotencyKey,
          },
          json: {
            customerId: input.customerId,
            currency: input.currency,
            lines: input.lines,
          },
        });
        return data as {
          id: string;
          customerId: string;
          currency: string;
          lines: Array<{ item: string; qty: string; unitPrice: string; taxRate: string }>;
        };
      },
    },
  ],
  verification: {
    adapter: true,
    betaScope: "deferred",
    contractTested: true,
    live: "blocked",
    liveNote: "Needs a Mizano scoped API key (MZ G5 · FlowLine integration API); mocked in contract tests only",
  },
};

export default provider;
