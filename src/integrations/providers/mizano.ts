import { z } from "zod";
import type { ActionDef, ProviderDef } from "../types";

interface HealthResponse {
  status: string;
  timestamp: string;
}

const healthOutput = z.object({
  status: z.string(),
  timestamp: z.string(),
});

const provider: ProviderDef = {
  id: "mizano",
  name: "Mizano",
  icon: "📊",
  category: "Finance",
  description: "Mizano financial data and invoice management",
  authType: "api_key",
  apiBase: "https://abdelrahmans-mac-mini.tailb66912.ts.net:8446",
  connectFields: [
    {
      key: "baseUrl",
      label: "Base URL",
      secret: false,
      placeholder: "https://example.com",
      help: "The Mizano API base URL (e.g., https://api.mizano.com)",
    },
    {
      key: "apiKey",
      label: "API Key",
      secret: true,
      placeholder: "mizano_...",
      help: "Your Mizano scoped API key",
    },
  ],
  async identity(ctx) {
    // Test the health endpoint with the provided credentials
    const res = await ctx.http.request<HealthResponse>({
      method: "GET",
      path: "/api/health",
    });

    if (res.status !== 200) {
      throw new Error(`Mizano health check failed: ${res.status} ${res.data}`);
    }

    return {
      accountId: "mizano",
      label: `Mizano (${res.data.status})`,
    };
  },
  actions: [],
  verification: {
    adapter: true,
    betaScope: "deferred",
    contractTested: false,
    live: "blocked",
    liveNote: "Test connection only; live calls blocked by scoped API keys task (MZ G5)",
  },
};

export default provider;
