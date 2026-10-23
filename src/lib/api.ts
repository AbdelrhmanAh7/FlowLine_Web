export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
  /** True when the request never reached the server (offline, DNS, server down). */
  get isNetwork() {
    return this.status === 0;
  }
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(path, {
      ...rest,
      headers: { ...(json !== undefined ? { "content-type": "application/json" } : {}), ...headers },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
      credentials: "same-origin",
    });
  } catch {
    throw new ApiError(0, "NETWORK", "Can't reach Flowline — check your connection");
  }
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok) {
    // Our own endpoints nest the error under `error`; better-auth returns `{ code, message }` at the top level.
    const b = body as { error?: { code?: string; message?: string; details?: unknown }; code?: string; message?: string; details?: unknown } | null;
    const e = b?.error ?? b ?? undefined;
    throw new ApiError(res.status, e?.code ?? `HTTP_${res.status}`, e?.message ?? `Request failed (${res.status})`, e?.details);
  }
  return body as T;
}
