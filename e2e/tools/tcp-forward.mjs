#!/usr/bin/env node
/**
 * Forwards 127.0.0.1:<port> inside a container to host.docker.internal:<port>, so a browser in the Linux
 * Playwright image reaches the host's test stack as "localhost" (same origin, cookies and CSRF checks as on
 * the host). Used only to run the WebKit project where WebKit can't run natively (see e2e/tools/webkit-docker.sh).
 *   node e2e/tools/tcp-forward.mjs 3100 4010 4011
 */
import net from "node:net";

const target = process.env.FORWARD_HOST ?? "host.docker.internal";
for (const port of process.argv.slice(2).map(Number)) {
  net
    .createServer((client) => {
      const upstream = net.connect(port, target);
      client.pipe(upstream).pipe(client);
      const close = () => {
        client.destroy();
        upstream.destroy();
      };
      client.on("error", close);
      upstream.on("error", close);
    })
    .listen(port, "127.0.0.1", () => console.log(`forward 127.0.0.1:${port} → ${target}:${port}`));
}
