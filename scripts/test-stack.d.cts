/** Types for scripts/test-stack.cjs (one isolated E2E test stack: ports, URLs, database). */
export interface TestStack {
  port: number;
  fakePort: number;
  aiPort: number;
  db: string;
  baseUrl: string;
  fakeUrl: string;
  aiUrl: string;
  healthUrl: string;
  shard: string;
}
export declare const DB_NAME: RegExp;
export declare function testStack(env?: NodeJS.ProcessEnv): TestStack;
export declare function applyTestStackEnv(env?: NodeJS.ProcessEnv): TestStack;
