import { z } from "zod";
import { checkUrl, EgressError } from "@/server/egress";
import { ProviderError, type Credentials, type ProviderDef } from "../types";

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

const provider: ProviderDef = {
  id: "mizano",
  name: "Mizano",
  icon: "📒",
  category: "Finance",
  description: "Read overdue invoices from Mizano for follow-up.",
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
        currency: z.string().length(3),
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
