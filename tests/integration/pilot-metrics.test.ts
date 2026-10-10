import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { db, pool, schema } from "@/db";
import { collectPilotMetrics, formatMetricsAsMarkdown } from "../../scripts/pilot-metrics";

const TEST_FROM = new Date("2026-10-16T00:00:00Z");
const TEST_TO = new Date("2026-10-23T23:59:59.999Z");

async function seedTestData() {
  // Create test users
  const user1Id = randomUUID();
  const user2Id = randomUUID();
  const user3Id = randomUUID();

  await db.insert(schema.user).values([
    {
      id: user1Id,
      email: "user1@test.local",
      name: "User One",
      emailVerified: true,
      createdAt: new Date("2026-10-17T10:00:00Z"),
    },
    {
      id: user2Id,
      email: "user2@test.local",
      name: "User Two",
      emailVerified: true,
      createdAt: new Date("2026-10-18T10:00:00Z"),
    },
    {
      id: user3Id,
      email: "user3@test.local",
      name: "User Three",
      emailVerified: false,
      createdAt: new Date("2026-10-19T10:00:00Z"),
    },
  ]);

  // Email verification tokens (consumed)
  await db.insert(schema.emailToken).values([
    {
      tokenHash: "hash1",
      userId: user1Id,
      purpose: "verify",
      consumedAt: new Date("2026-10-17T12:00:00Z"), // 2 hours after signup
      expiresAt: new Date("2026-10-18T10:00:00Z"),
      createdAt: new Date("2026-10-17T10:00:00Z"),
    },
    {
      tokenHash: "hash2",
      userId: user2Id,
      purpose: "verify",
      consumedAt: new Date("2026-10-18T14:00:00Z"), // 4 hours after signup
      expiresAt: new Date("2026-10-19T10:00:00Z"),
      createdAt: new Date("2026-10-18T10:00:00Z"),
    },
  ]);

  // User settings with onboarding completed
  await db.insert(schema.userSettings).values([
    {
      userId: user1Id,
      onboardingCompletedAt: new Date("2026-10-17T14:00:00Z"),
      onboardingSkipped: false,
    },
    {
      userId: user2Id,
      onboardingCompletedAt: new Date("2026-10-18T15:00:00Z"),
      onboardingSkipped: false,
    },
    {
      userId: user3Id,
      onboardingCompletedAt: null,
      onboardingSkipped: true,
    },
  ]);

  // Workspaces created on same day as onboarding completion
  const ws1Id = randomUUID();
  const ws2Id = randomUUID();
  await db.insert(schema.workspace).values([
    {
      id: ws1Id,
      name: "Workspace 1",
      slug: "ws-1",
      createdBy: user1Id,
      createdAt: new Date("2026-10-17T14:30:00Z"), // Same day as onboarding
    },
    {
      id: ws2Id,
      name: "Workspace 2",
      slug: "ws-2",
      createdBy: user2Id,
      createdAt: new Date("2026-10-19T10:00:00Z"), // Next day (not same day)
    },
  ]);

  // Flow published by user1 within 3 days
  const flow1Id = randomUUID();
  await db.insert(schema.flow).values({
    id: flow1Id,
    workspaceId: ws1Id,
    name: "Published Flow",
    graph: { nodes: [], edges: [] },
    publishedVersionId: randomUUID(),
    publishedBy: user1Id,
    updatedAt: new Date("2026-10-18T10:00:00Z"), // Within 3 days of user1 signup (Oct 17)
    createdAt: new Date("2026-10-17T11:00:00Z"),
  });

  // Flow published by user2 after 3 days (should not count)
  const flow2Id = randomUUID();
  await db.insert(schema.flow).values({
    id: flow2Id,
    workspaceId: ws2Id,
    name: "Late Published Flow",
    graph: { nodes: [], edges: [] },
    publishedVersionId: randomUUID(),
    publishedBy: user2Id,
    updatedAt: new Date("2026-10-22T10:00:00Z"), // 4 days after user2 signup (Oct 18)
    createdAt: new Date("2026-10-18T11:00:00Z"),
  });

  // Runs for success rate and queue-to-start
  const flowVersionId = randomUUID();
  await db.insert(schema.flowVersion).values({
    id: flowVersionId,
    flowId: flow1Id,
    version: 1,
    revision: 1,
    name: "Published Flow",
    graph: { nodes: [], edges: [] },
    reason: "publish",
    createdBy: user1Id,
    createdAt: new Date("2026-10-18T10:00:00Z"),
  });

  // 5 succeeded, 2 failed, 1 queued (not counted in success rate)
  await db.insert(schema.run).values([
    {
      id: randomUUID(),
      workspaceId: ws1Id,
      flowId: flow1Id,
      flowVersionId,
      number: 1,
      status: "succeeded",
      createdAt: new Date("2026-10-17T12:00:00Z"),
      startedAt: new Date("2026-10-17T12:00:05Z"), // 5s queue-to-start
      finishedAt: new Date("2026-10-17T12:00:15Z"),
    },
    {
      id: randomUUID(),
      workspaceId: ws1Id,
      flowId: flow1Id,
      flowVersionId,
      number: 2,
      status: "succeeded",
      createdAt: new Date("2026-10-17T13:00:00Z"),
      startedAt: new Date("2026-10-17T13:00:10Z"), // 10s queue-to-start
      finishedAt: new Date("2026-10-17T13:00:20Z"),
    },
    {
      id: randomUUID(),
      workspaceId: ws1Id,
      flowId: flow1Id,
      flowVersionId,
      number: 3,
      status: "succeeded",
      createdAt: new Date("2026-10-17T14:00:00Z"),
      startedAt: new Date("2026-10-17T14:00:15Z"), // 15s queue-to-start
      finishedAt: new Date("2026-10-17T14:00:25Z"),
    },
    {
      id: randomUUID(),
      workspaceId: ws1Id,
      flowId: flow1Id,
      flowVersionId,
      number: 4,
      status: "succeeded",
      createdAt: new Date("2026-10-18T10:00:00Z"),
      startedAt: new Date("2026-10-18T10:00:20Z"), // 20s queue-to-start
      finishedAt: new Date("2026-10-18T10:00:30Z"),
    },
    {
      id: randomUUID(),
      workspaceId: ws1Id,
      flowId: flow1Id,
      flowVersionId,
      number: 5,
      status: "succeeded",
      createdAt: new Date("2026-10-18T11:00:00Z"),
      startedAt: new Date("2026-10-18T11:00:25Z"), // 25s queue-to-start
      finishedAt: new Date("2026-10-18T11:00:35Z"),
    },
    {
      id: randomUUID(),
      workspaceId: ws1Id,
      flowId: flow1Id,
      flowVersionId,
      number: 6,
      status: "failed",
      createdAt: new Date("2026-10-18T12:00:00Z"),
      startedAt: new Date("2026-10-18T12:00:30Z"), // 30s queue-to-start
      finishedAt: new Date("2026-10-18T12:00:35Z"),
    },
    {
      id: randomUUID(),
      workspaceId: ws1Id,
      flowId: flow1Id,
      flowVersionId,
      number: 7,
      status: "failed",
      createdAt: new Date("2026-10-19T10:00:00Z"),
      startedAt: new Date("2026-10-19T10:00:40Z"), // 40s queue-to-start
      finishedAt: new Date("2026-10-19T10:00:45Z"),
    },
    {
      id: randomUUID(),
      workspaceId: ws1Id,
      flowId: flow1Id,
      flowVersionId,
      number: 8,
      status: "queued",
      createdAt: new Date("2026-10-19T11:00:00Z"),
      startedAt: null,
      finishedAt: null,
    },
  ]);

  // Webhook endpoint
  const webhookEpId = randomUUID();
  await db.insert(schema.webhookEndpoint).values({
    id: webhookEpId,
    flowId: flow1Id,
    workspaceId: ws1Id,
    token: "test-token",
    secretEnc: "enc",
    keyId: "key1",
    active: true,
    createdAt: new Date("2026-10-17T10:00:00Z"),
  });

  // Webhook events: 2 accepted (created runs)
  const runForWebhook1 = randomUUID();
  const runForWebhook2 = randomUUID();
  const evt1 = `evt-${randomUUID().slice(0, 8)}`;
  const evt2 = `evt-${randomUUID().slice(0, 8)}`;
  await db.insert(schema.run).values([
    {
      id: runForWebhook1,
      workspaceId: ws1Id,
      flowId: flow1Id,
      flowVersionId,
      number: 9,
      status: "succeeded",
      triggerKind: "webhook",
      triggerRef: evt1,
      createdAt: new Date("2026-10-17T15:00:00Z"),
      startedAt: new Date("2026-10-17T15:00:01Z"),
      finishedAt: new Date("2026-10-17T15:00:05Z"),
    },
    {
      id: runForWebhook2,
      workspaceId: ws1Id,
      flowId: flow1Id,
      flowVersionId,
      number: 10,
      status: "succeeded",
      triggerKind: "webhook",
      triggerRef: evt2,
      createdAt: new Date("2026-10-18T10:00:00Z"),
      startedAt: new Date("2026-10-18T10:00:01Z"),
      finishedAt: new Date("2026-10-18T10:00:05Z"),
    },
  ]);

  await db.insert(schema.webhookEvent).values([
    {
      endpointId: webhookEpId,
      eventId: evt1,
      bodySha256: "sha1",
      signedAt: new Date("2026-10-17T15:00:00Z"),
      receivedAt: new Date("2026-10-17T15:00:00Z"),
      runId: runForWebhook1,
      status: "accepted",
      detail: null,
      signature: "sig1",
    },
    {
      endpointId: webhookEpId,
      eventId: evt2,
      bodySha256: "sha2",
      signedAt: new Date("2026-10-18T10:00:00Z"),
      receivedAt: new Date("2026-10-18T10:00:00Z"),
      runId: runForWebhook2,
      status: "accepted",
      detail: null,
      signature: "sig2",
    },
  ]);

  // Approvals for workflow runs
  await db.insert(schema.approval).values([
    {
      id: randomUUID(),
      workspaceId: ws1Id,
      runId: runForWebhook1,
      flowVersionId,
      nodeId: "node-1",
      kind: "approval",
      actionId: "send_email",
      argsHash: "hash1",
      status: "approved",
      requestedAt: new Date("2026-10-17T15:00:00Z"),
      expiresAt: new Date("2026-10-18T15:00:00Z"),
      decidedAt: new Date("2026-10-17T15:00:30Z"),
    },
    {
      id: randomUUID(),
      workspaceId: ws1Id,
      runId: runForWebhook2,
      flowVersionId,
      nodeId: "node-2",
      kind: "approval",
      actionId: "post_message",
      argsHash: "hash2",
      status: "approved",
      requestedAt: new Date("2026-10-18T10:00:00Z"),
      expiresAt: new Date("2026-10-19T10:00:00Z"),
      decidedAt: new Date("2026-10-18T10:00:30Z"),
    },
    {
      id: randomUUID(),
      workspaceId: ws1Id,
      agentRunId: randomUUID(), // Agent tool approval, not workflow
      flowVersionId,
      nodeId: "node-3",
      kind: "review",
      actionId: "ask_user",
      argsHash: "hash3",
      status: "pending",
      requestedAt: new Date("2026-10-18T12:00:00Z"),
      expiresAt: new Date("2026-10-19T12:00:00Z"),
    },
  ]);

  // Platform audit event for access denial
  await db.insert(schema.platformAuditEvent).values({
    actorUserId: user1Id,
    actorLabel: "user1@test.local",
    assurance: "session",
    action: "admin.access_denied",
    result: "denied",
    at: new Date("2026-10-17T16:00:00Z"),
  });
}

async function cleanupTestData() {
  // Delete in reverse order of dependencies
  await db.delete(schema.platformAuditEvent).execute();
  await db.delete(schema.approval).execute();
  await db.delete(schema.webhookEvent).execute();
  await db.delete(schema.webhookEndpoint).execute();
  await db.delete(schema.run).execute();
  await db.delete(schema.flowVersion).execute();
  await db.delete(schema.flow).execute();
  await db.delete(schema.workspace).execute();
  await db.delete(schema.userSettings).execute();
  await db.delete(schema.emailToken).execute();
  await db.delete(schema.user).execute();
}

describe("pilot-metrics", () => {
  beforeAll(async () => {
    await cleanupTestData();
    await seedTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
    await pool.end();
  });

  it("collects sign-ups and median time to verified correctly", async () => {
    const metrics = await collectPilotMetrics(db, TEST_FROM, TEST_TO);

    // 3 users created in date range
    expect(metrics.signups).toBe(3);
    // Median of 2h and 4h = 3h
    expect(metrics.medianHoursToVerified).toBeCloseTo(3, 1);
  });

  it("collects onboarding + workspace day 1 and published flow within 3 days correctly", async () => {
    const metrics = await collectPilotMetrics(db, TEST_FROM, TEST_TO);

    // user1: onboarding Oct 17, workspace Oct 17 (same day) -> counts
    // user2: onboarding Oct 18, workspace Oct 19 (next day) -> doesn't count
    // user3: onboarding skipped -> doesn't count
    expect(metrics.onboardingAndWorkspaceDay1).toBe(1);

    // user1: published flow Oct 18 (1 day after signup Oct 17) -> counts
    // user2: published flow Oct 22 (4 days after signup Oct 18) -> doesn't count
    expect(metrics.publishedFlowWithin3Days).toBe(1);
  });

  it("formats metrics as Markdown table", async () => {
    const metrics = await collectPilotMetrics(db, TEST_FROM, TEST_TO);
    const markdown = formatMetricsAsMarkdown(metrics, TEST_FROM, TEST_TO);

    expect(markdown).toContain("# Pilot Metrics: 2026-10-16 to 2026-10-23");
    expect(markdown).toContain("| Metric | Value |");
    expect(markdown).toContain(`| Sign-ups | ${metrics.signups} |`);
    expect(markdown).toContain(`| Onboarding completed + workspace created on day 1 | ${metrics.onboardingAndWorkspaceDay1} |`);
  });
});