import type { Client } from "pg";
import { runConcurrent, type TxContext } from "../helpers/concurrentTx";
import { connect } from "./pg-lock-helpers";

/** One side of a pair: runs inside BEGIN … COMMIT on its own connection; call `ctx.arrive()` at the barrier. */
export type PgTx<T> = (client: Client, ctx: TxContext) => Promise<T>;

/**
 * Thin Postgres adapter for `runConcurrent` (issue #116): opens two dedicated connections from the integration
 * DATABASE_URL through `connect()` (bounded connect and statement timeouts), wraps each side in a transaction
 * (ROLLBACK on error, so a 40P01 victim releases its locks and the survivor can finish) and closes both connections
 * only after both sides have settled. On a timeout the connections are closed at once, which aborts the hung pair.
 */
export async function runConcurrentPg<A, B>(txA: PgTx<A>, txB: PgTx<B>, { timeoutMs }: { timeoutMs: number }): Promise<[A, B]> {
  const clients = await Promise.all([connect(), connect()]);
  for (const c of clients) c.on("error", () => {}); // a dropped connection surfaces as a query rejection instead
  const sides: Promise<unknown>[] = [];
  const close = () => Promise.all(clients.map((c) => c.end().catch(() => {})));
  const wrap = <T>(client: Client, fn: PgTx<T>) => (ctx: TxContext) => {
    const side = (async () => {
      await client.query("begin");
      try {
        const result = await fn(client, ctx);
        await client.query("commit");
        return result;
      } catch (err) {
        await client.query("rollback").catch(() => {});
        throw err;
      }
    })();
    sides.push(side);
    return side;
  };
  let timedOut = false;
  try {
    return await runConcurrent(wrap(clients[0], txA), wrap(clients[1], txB), { timeoutMs }).catch((err: unknown) => {
      timedOut = /timed out/i.test(String((err as Error)?.message));
      throw err;
    });
  } finally {
    if (timedOut) await close();
    await Promise.allSettled(sides);
    await close();
  }
}
