// Focused no-env/no-global-setup runner; standard local dependency resolution works in CI.
const config = {
  test: { include: ["tests/unit/dv2-02-verifier.test.ts"], environment: "node", fileParallelism: false, maxWorkers: 1 },
};
export default config;
