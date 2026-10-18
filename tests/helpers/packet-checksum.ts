import { createHash } from "node:crypto";

/**
 * Verifies packet bytes against the frozen `SHA256SUMS` file content (`<hex digest>  <file name>` per line), so a run is
 * never recorded against an edited packet (#142).
 *
 * @param bytes - The packet file bytes as read from disk
 * @param fileName - The (already sanitized) packet file name to look up in the checksum list
 * @param sumsText - The text of `packet/SHA256SUMS`
 * @returns The computed sha256 hex digest (to record in the run summary)
 * @throws Error if the file has no checksum entry or the computed digest differs from the listed one
 */
export function verifyPacketChecksum(bytes: Buffer, fileName: string, sumsText: string): string {
  const computed = createHash("sha256").update(bytes).digest("hex");
  const line = sumsText.split("\n").find((l) => l.trim().endsWith(` ${fileName}`));
  if (!line) throw new Error(`${fileName} has no entry in packet/SHA256SUMS: refusing a run not bound to frozen packet contents`);
  const expected = line.trim().split(/\s+/)[0];
  if (computed !== expected) {
    throw new Error(`${fileName} SHA256 mismatch (computed ${computed}, expected ${expected}): refusing a run with modified packet contents`);
  }
  return computed;
}
