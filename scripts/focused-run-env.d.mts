export interface FocusedEnvRecord {
  policy: "allowlist";
  platform: string;
  /** Names the child may inherit from the ambient environment on this platform. */
  allowlist: string[];
  /** Allowlisted names that existed in the ambient environment and were forwarded (as the child sees them). */
  inheritedNames: string[];
  /** Names the helper constructed itself. */
  explicitNames: string[];
  /** Count of ambient variables that were not forwarded (never their names or values). */
  ambientVariablesNotForwarded: number;
}

export declare function allowlistFor(platform?: string): string[];
export declare function buildFocusedTestEnv(
  parentEnv: Record<string, string | undefined>,
  explicit: Record<string, string | undefined>,
  options?: { platform?: string },
): { env: Record<string, string>; record: FocusedEnvRecord };
