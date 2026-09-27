import jsonata from "jsonata";

export const EXPRESSION_MAX_LENGTH = 4000;
export const EXPRESSION_TIMEOUT_MS = 1000;
export const EXPRESSION_MAX_DEPTH = 200;
export const VALUE_MAX_BYTES = 256 * 1024;

export class ExpressionError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Returns an error message if the expression does not parse, otherwise null. */
export function checkExpressionSyntax(source: string): string | null {
  if (source.length > EXPRESSION_MAX_LENGTH) return `Expression is longer than ${EXPRESSION_MAX_LENGTH} characters`;
  try {
    jsonata(source);
    return null;
  } catch (err) {
    return describeJsonataError(err);
  }
}

function describeJsonataError(err: unknown): string {
  if (err && typeof err === "object" && "message" in err) {
    const e = err as { message: string; position?: number };
    return e.position != null ? `${e.message} (at character ${e.position})` : e.message;
  }
  return String(err);
}

/**
 * Evaluate JSONata with a wall-clock and recursion budget (JSONata's documented
 * timebox hooks), so a runaway expression cannot hang the worker.
 */
export async function evaluateExpression(source: string, input: unknown, bindings?: Record<string, unknown>): Promise<unknown> {
  if (source.length > EXPRESSION_MAX_LENGTH) {
    throw new ExpressionError("EXPRESSION_TOO_LONG", `Expression is longer than ${EXPRESSION_MAX_LENGTH} characters`);
  }
  let expr: jsonata.Expression;
  try {
    expr = jsonata(source);
  } catch (err) {
    throw new ExpressionError("EXPRESSION_SYNTAX", describeJsonataError(err));
  }

  let depth = 0;
  const started = Date.now();
  const check = () => {
    if (depth > EXPRESSION_MAX_DEPTH) {
      throw { code: "EXPRESSION_DEPTH", message: `Expression exceeded the recursion limit (${EXPRESSION_MAX_DEPTH})` };
    }
    if (Date.now() - started > EXPRESSION_TIMEOUT_MS) {
      throw { code: "EXPRESSION_TIMEOUT", message: `Expression took longer than ${EXPRESSION_TIMEOUT_MS}ms` };
    }
  };
  type Env = { isParallelCall?: boolean };
  expr.assign(Symbol.for("jsonata.__evaluate_entry") as unknown as string, (_e: unknown, _i: unknown, env: Env) => {
    if (env?.isParallelCall) return;
    depth += 1;
    check();
  });
  expr.assign(Symbol.for("jsonata.__evaluate_exit") as unknown as string, (_e: unknown, _i: unknown, env: Env) => {
    if (env?.isParallelCall) return;
    depth -= 1;
    check();
  });

  let result: unknown;
  try {
    result = await expr.evaluate(input as never, bindings);
  } catch (err) {
    const e = err as { code?: string; message?: string };
    const code = e?.code?.startsWith("EXPRESSION_") ? e.code : "EXPRESSION_RUNTIME";
    throw new ExpressionError(code, describeJsonataError(err));
  }
  return normalizeValue(result);
}

/** JSONata returns sequences with extra props and `undefined` for no match; store plain JSON. */
export function normalizeValue(value: unknown): unknown {
  if (value === undefined) return null;
  const text = JSON.stringify(value);
  if (text === undefined) return null;
  if (text.length > VALUE_MAX_BYTES) {
    throw new ExpressionError("VALUE_TOO_LARGE", `Result is larger than ${Math.round(VALUE_MAX_BYTES / 1024)}KB`);
  }
  return JSON.parse(text);
}
