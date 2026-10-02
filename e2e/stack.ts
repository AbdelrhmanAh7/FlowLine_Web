import { testStack } from "../scripts/test-stack.cjs";

/**
 * The test stack this run targets (FLOWLINE_TEST_PORT / _FAKE_PORT / _AI_PORT / _DB, defaults 3100 / 4010 / 4011 /
 * flowline_test) — derived in scripts/test-stack.cjs, exactly like the stack itself (scripts/dev-test.mjs).
 * playwright.config.ts has already loaded .env.test and applied the stack env by the time specs import this.
 */
export const STACK = testStack();
/** The app as the browser sees it, e.g. http://localhost:3100. */
export const BASE_URL = STACK.baseUrl;
/** Fake SaaS providers (e2e/fakes/provider-server.ts), e.g. http://127.0.0.1:4010. */
export const FAKE_PROVIDER = STACK.fakeUrl;
/** Fake OpenAI-compatible AI provider (e2e/fakes/ai-server.ts), e.g. http://127.0.0.1:4011. */
export const AI_FAKE = STACK.aiUrl;
