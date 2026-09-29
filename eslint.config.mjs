import next from "eslint-config-next";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...next,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true }],
    },
  },
  {
    // Crypto v2 (docs/security/CREDENTIALS_DESIGN.md MUST 5): production code never writes or reads v1 (no AAD) blobs
    // directly. Legacy rows are opened only through `openSecret(..., { legacy })`.
    files: ["src/**/*.{ts,tsx}", "worker/**/*.ts"],
    ignores: ["src/server/crypto.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: ["@/server/crypto", "./crypto", "../crypto"].map((name) => ({
            name,
            importNames: ["encryptSecret", "decryptSecret", "decryptLegacyV1"],
            message: "v1 ciphertext has no AAD. Use encryptSecretV2 / openSecret with the row context.",
          })),
        },
      ],
    },
  },
  { ignores: [".next/**", ".next-test/**", "node_modules/**", "artifacts/**", "playwright-report/**", "test-results/**", "drizzle/**", "next-env.d.ts"] },
];

export default config;
