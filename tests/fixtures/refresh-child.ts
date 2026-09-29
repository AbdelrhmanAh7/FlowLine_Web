/**
 * A SEPARATE long-lived process (like the worker container) used by the rotation test: it is started BEFORE a
 * credential rotation and keeps running. Each stdin line "<connectionId> <workspaceId> <providerId>" makes it fetch
 * runtime credentials (refreshing when due) and print one JSON line — proving rotation needs no restart.
 */
import { createInterface } from "node:readline";
import { db, pool } from "@/db";
import { ConnectionError, getRuntimeCredentials } from "@/server/connections";

const rl = createInterface({ input: process.stdin });
console.log(JSON.stringify({ ready: true, pid: process.pid }));
rl.on("line", (line) => {
  const [connectionId, workspaceId, providerId] = line.trim().split(/\s+/);
  if (!connectionId) return;
  void getRuntimeCredentials(db, { connectionId, workspaceId: workspaceId!, providerId: providerId!, requiredScopes: [] })
    .then((r) => console.log(JSON.stringify({ ok: true, token: r.creds.token, credVersion: r.connection.credVersion })))
    .catch((e) => console.log(JSON.stringify({ ok: false, code: e instanceof ConnectionError ? e.code : "ERROR" })));
});
rl.on("close", () => void pool.end());
