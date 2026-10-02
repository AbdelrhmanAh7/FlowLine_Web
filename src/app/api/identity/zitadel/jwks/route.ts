import { activeZitadelSource, cachedZitadelJwks } from "@/server/zitadel-metadata";

export const dynamic = "force-dynamic";

export async function GET() {
  const source = await activeZitadelSource();
  if (!source) return new Response(null, { status: 404, headers: { "cache-control": "no-store" } });
  try {
    const keys = await cachedZitadelJwks(source.issuer, source.revision);
    return Response.json(keys, { headers: { "cache-control": "public, max-age=60", "referrer-policy": "no-referrer" } });
  } catch { return new Response(null, { status: 502, headers: { "cache-control": "no-store" } }); }
}
