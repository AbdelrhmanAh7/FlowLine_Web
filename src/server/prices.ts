import type { PriceEntry, PriceTable } from "@/db/schema";

/** Price lookup: exact key, then provider wildcard. Keys: "ai:<provider>/<model>", "action:<actionId>", "http", "run". No defaults are invented. */
export function priceFor(prices: PriceTable, key: string): PriceEntry | undefined {
  if (prices[key]) return prices[key];
  const [kind, rest] = key.split(":");
  const provider = rest?.split("/")[0];
  if (provider && prices[`${kind}:${provider}/*`]) return prices[`${kind}:${provider}/*`];
  return prices[`${kind}:*`];
}
