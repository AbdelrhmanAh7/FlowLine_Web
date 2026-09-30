export function extractEmailToken(text: string | null | undefined, purpose?: "verify" | "reset"): string | null;
export function parseEnvFile(text: string): Record<string, string>;
export function percentile(xs: number[], p: number): number | null;
