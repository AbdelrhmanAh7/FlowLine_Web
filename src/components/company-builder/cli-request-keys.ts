export type CliRequest = { cli: "claude" | "codex"; kind: "blueprint" | "text_trial"; text?: string };

/** Key retries by the immutable submitted request, not a textarea's later value. */
export function createCliRequestKeys(mint: () => string) {
  const keys = new Map<string, string>();
  const identity = (request: CliRequest) => JSON.stringify([request.cli, request.kind, request.kind === "text_trial" ? request.text : ""]);
  return {
    get(request: CliRequest) {
      const id = identity(request);
      if (!keys.has(id)) keys.set(id, mint());
      return keys.get(id)!;
    },
    complete(request: CliRequest) { keys.delete(identity(request)); },
  };
}
