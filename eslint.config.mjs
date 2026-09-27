import next from "eslint-config-next";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...next,
  ...nextTs,
  { ignores: [".next/**", ".next-test/**", "node_modules/**", "artifacts/**", "playwright-report/**", "test-results/**", "drizzle/**", "next-env.d.ts"] },
];

export default config;
