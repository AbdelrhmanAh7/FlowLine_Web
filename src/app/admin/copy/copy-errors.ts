"use client";

import { ApiError } from "@/lib/api";

/**
 * Maps an error cause to a user-friendly translation key for the copy editor.
 * Never exposes raw server messages or stack traces to the UI.
 *
 * @param cause - The caught error (unknown type)
 * @param fallbackKey - Default translation key for save/publish errors
 * @returns A translation key under platformAdmin.copyEditor.*
 */
export function copyErrorKey(
  cause: unknown,
  fallbackKey: "platformAdmin.copyEditor.saveError" | "platformAdmin.copyEditor.publishError"
): "platformAdmin.copyEditor.conflict" | "platformAdmin.copyEditor.stepUp" | "platformAdmin.copyEditor.networkError" | "platformAdmin.copyEditor.serverError" | "platformAdmin.copyEditor.saveError" | "platformAdmin.copyEditor.publishError" {
  if (cause instanceof ApiError) {
    // Revision conflict (409) — the draft changed since load
    if (cause.code === "REVISION_CONFLICT") {
      return "platformAdmin.copyEditor.conflict";
    }
    // Step-up required — need to re-authenticate
    if (cause.code === "STEP_UP_REQUIRED") {
      return "platformAdmin.copyEditor.stepUp";
    }
    // Network error — never reached the server
    if (cause.isNetwork) {
      return "platformAdmin.copyEditor.networkError";
    }
    // Server error (5xx) — internal server problem
    if (cause.status >= 500) {
      return "platformAdmin.copyEditor.serverError";
    }
    // Other API errors (4xx) — use fallback
    return fallbackKey;
  }
  // Non-API errors (e.g., thrown strings, TypeError) — use fallback
  return fallbackKey;
}