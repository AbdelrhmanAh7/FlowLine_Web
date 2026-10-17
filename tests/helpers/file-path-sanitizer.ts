/**
 * Sanitizes and validates a packet file name to prevent directory traversal and path injection attacks.
 * The PACKET env var is used in a file path, so it must be validated to ensure it only
 * refers to a valid file name within the intended directory.
 *
 * This function:
 * - Rejects control characters and null bytes
 * - Rejects shell metacharacters (;, |, &, etc.)
 * - Rejects absolute paths (starting with / or \)
 * - Rejects relative paths with parent directory references (..)
 * - Rejects paths with directory separators (/ or \)
 * - Validates filename characters: alphanumeric, dots, hyphens, and underscores;
 *   the first and last character must be alphanumeric (e.g., trailing '.', '-', '_' are rejected)
 * - Must not contain consecutive dots (..)
 * - Throws an Error with a clear message on invalid filenames instead of silently falling back,
 *   preventing accidental runs against unintended packet versions.
 *
 * @param filename - The filename from PACKET env var or default
 * @returns The validated filename
 * @throws Error if the filename is invalid or unsafe
 */
export function sanitizePacketFileName(filename: string): string {
  if (!filename || typeof filename !== "string" || !filename.trim()) {
    throw new Error("Invalid PACKET filename: filename must be a non-empty string");
  }

  // Reject paths with control characters or null byte
  if (filename.includes("\0") || /[\x00-\x1f\x7f]/.test(filename)) {
    throw new Error(`Invalid PACKET filename "${filename}": control characters are not allowed`);
  }

  // Reject paths with shell metacharacters
  if (/[;|&()<>]/.test(filename)) {
    throw new Error(`Invalid PACKET filename "${filename}": shell metacharacters are not allowed`);
  }

  // Reject absolute paths
  if (filename.startsWith("/") || filename.startsWith("\\")) {
    throw new Error(`Invalid PACKET filename "${filename}": absolute paths are not allowed`);
  }

  // Reject paths with parent directory references
  if (filename.includes("..")) {
    throw new Error(`Invalid PACKET filename "${filename}": parent directory references are not allowed`);
  }

  // Reject paths with directory separators
  if (filename.includes("/") || filename.includes("\\")) {
    throw new Error(`Invalid PACKET filename "${filename}": directory separators are not allowed`);
  }

  // Allow only alphanumeric, dots, hyphens, and underscores; the first and last character must be alphanumeric
  // (so a leading or trailing dot, hyphen or underscore, e.g. "packet.json.", is rejected).
  const validFilename = /^[a-zA-Z0-9](?:[a-zA-Z0-9._-]*[a-zA-Z0-9])?$/;
  if (!validFilename.test(filename)) {
    throw new Error(
      `Invalid PACKET filename "${filename}": must contain only alphanumeric characters, dots, hyphens, and underscores, and cannot start or end with punctuation`,
    );
  }

  return filename;
}
