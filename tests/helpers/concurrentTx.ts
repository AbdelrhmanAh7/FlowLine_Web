/**
 * Runs two transactions concurrently, with a barrier so both reach their first lock
 * before either proceeds. Driver-agnostic: pass any function that takes a context.
 *
 * Usage:
 *   const [a, b] = await runConcurrent(
 *     async (ctx) => { await ctx.arrive(); await lockRow(1); return "a"; },
 *     async (ctx) => { await ctx.arrive(); await lockRow(2); return "b"; },
 *     { timeoutMs: 2000 },
 *   );
 *
 * Rejects with a deadlock message on a 40P01 error, or a timeout message after timeoutMs.
 */

export type TxContext = { arrive: () => Promise<void> };
export type TxFn<T> = (ctx: TxContext) => Promise<T>;

export function makeBarrier(parties: number): TxContext {
  let waiting = 0;
  let release!: () => void;
  const open = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    arrive: () => {
      waiting += 1;
      if (waiting === parties) release();
      return open;
    },
  };
}

export async function runConcurrent<A, B>(
  txA: TxFn<A>,
  txB: TxFn<B>,
  { timeoutMs }: { timeoutMs: number },
): Promise<[A, B]> {
  const barrier = makeBarrier(2);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`runConcurrent timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
  });
  try {
    return await Promise.race([
      Promise.all([
        Promise.resolve().then(() => txA(barrier)),
        Promise.resolve().then(() => txB(barrier)),
      ]).catch((err: unknown) => {
        if ((err as { code?: unknown })?.code === "40P01") {
          throw new Error(`deadlock detected (40P01): ${(err as Error).message}`);
        }
        throw err;
      }),
      timeout,
    ]);
  } finally {
    clearTimeout(timer);
  }
}
