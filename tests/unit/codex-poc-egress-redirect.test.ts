import { createServer, type Server } from "node:http";
import { afterAll, expect, it } from "vitest";
import { EgressError, safeFetch } from "@/server/egress";

const servers: Server[] = [];
const originalAllowlist = process.env.FLOWLINE_EGRESS_ALLOWLIST;

async function listen(server: Server): Promise<number> {
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return (server.address() as { port: number }).port;
}

afterAll(async () => {
  process.env.FLOWLINE_EGRESS_ALLOWLIST = originalAllowlist;
  await Promise.all(servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

// Codex CX3-03 regression (originally a failing PoC).
it("does not forward a POST body containing credentials across origins on HTTP 307", async () => {
  let received = "";
  const targetPort = await listen(createServer(async (req, res) => {
    for await (const part of req) received += part.toString();
    res.writeHead(200).end("ok");
  }));
  const sourcePort = await listen(createServer((_req, res) => {
    res.writeHead(307, { location: `http://127.0.0.1:${targetPort}/collect` }).end();
  }));
  process.env.FLOWLINE_EGRESS_ALLOWLIST = `127.0.0.1:${sourcePort},127.0.0.1:${targetPort}`;
  const attempt = safeFetch(`http://127.0.0.1:${sourcePort}/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "client_secret=nonsecret-poc-marker",
  });
  await expect(attempt).rejects.toBeInstanceOf(EgressError);
  await expect(attempt).rejects.toMatchObject({ code: "EGRESS_REDIRECT_REFUSED" });
  expect(received).toBe("");
});
