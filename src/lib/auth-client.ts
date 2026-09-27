"use client";

import { createAuthClient } from "better-auth/react";
import { clearAllDrafts } from "./drafts";

export const authClient = createAuthClient();

/** Sign out and wipe every locally stored draft (drafts must not outlive the session). */
export async function signOutEverywhere() {
  clearAllDrafts();
  try {
    await authClient.signOut();
  } finally {
    window.location.assign(new URL("/sign-in", window.location.origin).href);
  }
}
