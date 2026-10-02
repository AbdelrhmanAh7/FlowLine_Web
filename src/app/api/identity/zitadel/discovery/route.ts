import { activeZitadelSource, cachedZitadelDiscovery, zitadelLocalUrl } from "@/server/zitadel-metadata";

export const dynamic = "force-dynamic";

export async function GET() {
  const source = await activeZitadelSource();
  const jwks = zitadelLocalUrl("jwks");
  if (!source || !jwks) return new Response(null, { status: 404, headers: { "cache-control": "no-store" } });
  try {
    const doc = await cachedZitadelDiscovery(source.issuer, source.revision);
    return Response.json({ ...doc, jwks_uri: jwks }, { headers: { "cache-control": "public, max-age=60", "referrer-policy": "no-referrer" } });
  } catch { return new Response(null, { status: 502, headers: { "cache-control": "no-store" } }); }
}
