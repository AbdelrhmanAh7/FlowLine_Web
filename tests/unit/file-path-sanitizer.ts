/**
 * Sanitizes a packet file name to prevent directory traversal and path injection attacks.
 * The PACKET env var is used in a file path, so it must be validated to ensure it only
 * refers to a file within the intended directory.
 *
 * This function:
 * - Rejects absolute paths (starting with / or \)
 * - Rejects relative paths with parent directory references (..)
 * - Rejects paths with directory separators (/ or \)
 * - Rejects paths with control characters or null bytes
 * - Rejects paths with shell metacharacters (;, |, &, etc.)
 * - Returns "packet.json" as the default safe filename
 *
 * @param filename - The filename from PACKET env var
 * @returns The sanitized filename, or "packet.json" if invalid
 */
export function sanitizePacketFileName(filename: string): string {
  if (!filename || typeof filename !== "string") {
    return "packet.json";
  }

  // Reject absolute paths
  if (filename.startsWith("/") || filename.startsWith("\\")) {
    return "packet.json";
  }

  // Reject paths with parent directory references
  if (filename.includes("..")) {
    return "packet.json";
  }

  // Reject paths with directory separators
  if (filename.includes("/") || filename.includes("\\")) {
    return "packet.json";
  }

  // Reject paths with control characters or null byte
  if (filename.includes("\0")) {
    return "packet.json";
  }

  // Reject paths with shell metacharacters
  const shellMetacharacters = /[;|&()<>]/;
  if (shellMetacharacters.test(filename)) {
    return "packet.json";
  }

  // Reject paths with control characters (excluding common whitespace)
  const controlChars = /[\x00-\x08\x0b\x0c\x0e-\x1f]/;
  if (controlChars.test(filename)) {
    return "packet.json";
  }

  // If the filename is valid, return it; otherwise return default
  // Allow only alphanumeric, dots, hyphens, and underscores, but not starting or ending with a dot
  const validFilename = /^[a-zA-Z0-9][a-zA-Z0-9._-]*[a-zA-Z0-9]*$/;
  return validFilename.test(filename) ? filename : "packet.json";
}
