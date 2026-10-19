import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error TS7016: this standalone Node CLI has no TypeScript declaration file.
import { CHECKLIST_IDS, evaluateChecklist, findLineNumber, formatMarkdown } from "../../scripts/ci/qa-checklist.mjs";

type ChecklistItem = {
  id: string;
  status: "PASS" | "FINDING";
  file: string;
  line: number;
  detail: string;
};

const runChecklist = (options?: object): ChecklistItem[] =>
  evaluateChecklist(options) as ChecklistItem[];

const root = fileURLToPath(new URL("../../", import.meta.url));

describe("ci-qa-checklist rule evaluators (fixtures)", () => {
  const baseGate = `name: Gate
on:
  pull_request:
    types: [opened, synchronize]
permissions:
  contents: read
jobs:
  changes:
    runs-on: ubuntu-24.04
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
  checks:
    runs-on: ubuntu-24.04
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
  chromium:
    runs-on: ubuntu-24.04
    timeout-minutes: 5
    strategy:
      matrix:
        shard: [1/2, 2/2]
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
  gate:
    runs-on: ubuntu-24.04
    timeout-minutes: 5
    steps:
      - run: echo ok
`;

  const baseClaude = `name: Claude
on:
  issue_comment:
    types: [created]
jobs:
  claude:
    runs-on: ubuntu-24.04
    env:
      HAS_TOKEN: \${{ secrets.CLAUDE_CODE_OAUTH_TOKEN != '' }}
    steps:
      - name: Gate
        run: |
          [ "$HAS_TOKEN" = "true" ] || exit 0
          perm="$(gh api repos/$REPO/collaborators/$ACTOR/permission --jq .permission)"
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
  review:
    runs-on: ubuntu-24.04
    permissions:
      pull-requests: write
    env:
      HAS_TOKEN: \${{ secrets.CLAUDE_CODE_OAUTH_TOKEN != '' }}
    steps:
      - name: Gate
        run: |
          [ "$HAS_TOKEN" = "true" ] || exit 0
          perm="$(gh api repos/$REPO/collaborators/$ACTOR/permission --jq .permission)"
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
`;

  it("evaluates actions-pinned-sha: PASS on pinned, FINDING on unpinned", () => {
    const passing = runChecklist({
      gateWorkflow: baseGate,
      claudeWorkflow: baseClaude,
      gateReportAction: "steps:\n  - uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a\n",
    });
    const passItem = passing.find((r) => r.id === "actions-pinned-sha");
    expect(passItem?.status).toBe("PASS");

    const unpinnedGate = baseGate.replace(
      "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
      "actions/checkout@v4",
    );
    const failing = runChecklist({
      gateWorkflow: unpinnedGate,
      claudeWorkflow: baseClaude,
      gateReportAction: "",
    });
    const failItem = failing.find((r) => r.id === "actions-pinned-sha");
    expect(failItem?.status).toBe("FINDING");
    expect(failItem?.line).toBe(12);
    expect(failItem?.detail).toContain("actions/checkout@v4");
  });

  it("evaluates ubuntu-2404-runner: PASS on 24.04, FINDING on other", () => {
    const passing = runChecklist({ gateWorkflow: baseGate, claudeWorkflow: baseClaude });
    const passItem = passing.find((r) => r.id === "ubuntu-2404-runner");
    expect(passItem?.status).toBe("PASS");

    const badRunner = baseGate.replace("runs-on: ubuntu-24.04", "runs-on: ubuntu-latest");
    const failing = runChecklist({ gateWorkflow: badRunner, claudeWorkflow: baseClaude });
    const failItem = failing.find((r) => r.id === "ubuntu-2404-runner");
    expect(failItem?.status).toBe("FINDING");
    expect(failItem?.line).toBe(9);
    expect(failItem?.detail).toContain("ubuntu-latest");
  });

  it("evaluates no-self-hosted: PASS on clean, FINDING on self-hosted", () => {
    const passing = runChecklist({ gateWorkflow: baseGate, claudeWorkflow: baseClaude });
    expect(passing.find((r) => r.id === "no-self-hosted")?.status).toBe("PASS");

    const selfHostedGate = baseGate.replace("runs-on: ubuntu-24.04", "runs-on: [self-hosted, macmini]");
    const failing = runChecklist({ gateWorkflow: selfHostedGate, claudeWorkflow: baseClaude });
    const failItem = failing.find((r) => r.id === "no-self-hosted");
    expect(failItem?.status).toBe("FINDING");
    expect(failItem?.line).toBe(9);
  });

  it("evaluates gate-secrets: PASS on no secrets, FINDING on secret ref", () => {
    const passing = runChecklist({ gateWorkflow: baseGate, claudeWorkflow: baseClaude });
    expect(passing.find((r) => r.id === "gate-secrets")?.status).toBe("PASS");

    const secretGate = baseGate.replace("timeout-minutes: 5", "env:\n      FOO: ${{ secrets.PROD_KEY }}");
    const failing = runChecklist({ gateWorkflow: secretGate, claudeWorkflow: baseClaude });
    const failItem = failing.find((r) => r.id === "gate-secrets");
    expect(failItem?.status).toBe("FINDING");
    expect(failItem?.line).toBe(11);
  });

  it("evaluates fast-tier-timeout: PASS when 5m, FINDING on bad timeout or un-sharded full tier", () => {
    const passing = runChecklist({ gateWorkflow: baseGate, claudeWorkflow: baseClaude });
    expect(passing.find((r) => r.id === "fast-tier-timeout")?.status).toBe("PASS");

    const longTimeout = baseGate.replace("timeout-minutes: 5", "timeout-minutes: 10");
    const failingTimeout = runChecklist({ gateWorkflow: longTimeout, claudeWorkflow: baseClaude });
    const failTimeoutItem = failingTimeout.find((r) => r.id === "fast-tier-timeout");
    expect(failTimeoutItem?.status).toBe("FINDING");
    expect(failTimeoutItem?.detail).toContain("timeout-minutes: 10");

    const unshardedFullTierChromium = baseGate.replace(
      "strategy:\n      matrix:\n        shard: [1/2, 2/2]",
      "env:\n      GATE_TIER: full",
    );
    const failingFullTier = runChecklist({
      gateWorkflow: unshardedFullTierChromium,
      claudeWorkflow: baseClaude,
    });
    const failFullTierItem = failingFullTier.find((r) => r.id === "fast-tier-timeout");
    expect(failFullTierItem?.status).toBe("FINDING");
    expect(failFullTierItem?.detail).toContain("without matrix sharding");
  });

  it("evaluates least-privilege-permissions: PASS when gated, FINDING when write lacks collaborator check", () => {
    const passing = runChecklist({ gateWorkflow: baseGate, claudeWorkflow: baseClaude });
    expect(passing.find((r) => r.id === "least-privilege-permissions")?.status).toBe("PASS");

    const unverifiedWriteReview = baseClaude.replaceAll(
      'perm="$(gh api repos/$REPO/collaborators/$ACTOR/permission --jq .permission)"',
      '# no perm check',
    );
    const failing = runChecklist({ gateWorkflow: baseGate, claudeWorkflow: unverifiedWriteReview });
    const failItem = failing.find((r) => r.id === "least-privilege-permissions");
    expect(failItem?.status).toBe("FINDING");
    expect(failItem?.detail).toContain("collaborator write-permission verification");
  });

  it("evaluates pr-target-checkout: PASS when no untrusted checkout, FINDING when head checked out on pr_target", () => {
    const passing = runChecklist({ gateWorkflow: baseGate, claudeWorkflow: baseClaude });
    expect(passing.find((r) => r.id === "pr-target-checkout")?.status).toBe("PASS");

    const prTargetGate = baseGate.replace(
      "pull_request:",
      "pull_request_target:\n  # checkout head.ref\n",
    ).replace(
      "with:\n      persist-credentials: false",
      "with:\n      ref: ${{ github.event.pull_request.head.ref }}",
    );
    const failing = runChecklist({ gateWorkflow: prTargetGate, claudeWorkflow: baseClaude });
    const failItem = failing.find((r) => r.id === "pr-target-checkout");
    expect(failItem?.status).toBe("FINDING");
  });

  it("evaluates claude-inert-without-secret: PASS when gated, FINDING when secret check missing", () => {
    const passing = runChecklist({ gateWorkflow: baseGate, claudeWorkflow: baseClaude });
    expect(passing.find((r) => r.id === "claude-inert-without-secret")?.status).toBe("PASS");

    const noSecretCheck = baseClaude.replace(
      "HAS_TOKEN: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN != '' }}",
      "HAS_TOKEN: true",
    );
    const failing = runChecklist({ gateWorkflow: baseGate, claudeWorkflow: noSecretCheck });
    const failItem = failing.find((r) => r.id === "claude-inert-without-secret");
    expect(failItem?.status).toBe("FINDING");
    expect(failItem?.detail).toContain("inert when CLAUDE_CODE_OAUTH_TOKEN is missing");
  });
});

describe("structural run against real repo files", () => {
  it("emits exactly the 8 expected checklist item IDs", () => {
    const results = runChecklist();
    expect(results.map((r) => r.id)).toEqual(CHECKLIST_IDS);
  });

  it("has valid status ('PASS' or 'FINDING') and resolvable file:line for every result", () => {
    const results = runChecklist();
    for (const item of results) {
      expect(["PASS", "FINDING"]).toContain(item.status);
      expect(item.file).toBeTruthy();
      expect(item.line).toBeGreaterThan(0);

      const filePath = join(root, item.file);
      expect(existsSync(filePath), `file ${item.file} should exist`).toBe(true);

      const content = readFileSync(filePath, "utf8");
      const lines = content.split(/\r?\n/);
      expect(item.line).toBeLessThanOrEqual(lines.length);
    }
  });

  it("produces identical items and statuses between markdown format and --json CLI output", () => {
    const scriptPath = join(root, "scripts/ci/qa-checklist.mjs");
    const jsonRun = spawnSync(process.execPath, [scriptPath, "--json"], { encoding: "utf8", cwd: root });
    const textRun = spawnSync(process.execPath, [scriptPath], { encoding: "utf8", cwd: root });

    expect(jsonRun.status).toBe(0); // All checklist items pass on ai/250
    expect(textRun.status).toBe(0);

    const jsonData = JSON.parse(jsonRun.stdout);
    expect(jsonData).toHaveLength(8);

    const textLines = textRun.stdout.trim().split("\n");
    expect(textLines).toHaveLength(8);

    for (let i = 0; i < 8; i++) {
      const j = jsonData[i];
      const t = textLines[i];
      expect(t.startsWith(`${j.status} ${j.id}`)).toBe(true);
      expect(t.endsWith(`${j.file}:${j.line}`)).toBe(true);
    }

    const localFormatted = formatMarkdown(jsonData);
    expect(localFormatted).toBe(textRun.stdout.trim());
    expect(findLineNumber("alpha\nbeta\ngamma", "beta")).toBe(2);
  });
});
