import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { db, pool, schema } from "@/db";
import { collectPilotMetrics, formatMetricsAsMarkdown } from "../../scripts/pilot-metrics";

const TEST_FROM = new Date("2026-10-16T00:00:00Z");
const TEST_TO = new Date("2026-10-23T23:59:59.999Z");

/**
 * Every ID seeded by one run. Cleanup deletes ONLY these rows (never the whole DB),
 * so the test is safe to run against a shared database and cannot race other suites.
 */
interface SeededIds {
  userIds: string[];
  emailTokenIds: string[];
  userSettingsIds: string[];
  workspaceIds: string[];
  flowIds: string[];
  flowVersionIds: string[];
  runIds: string[];
  webhookEndpointIds: string[];
  webhookEventIds: number[];
  approvalIds: string[];
  auditIds: number[];
}

async function seedTestData(): Promise<SeededIds> {
  // Run-specific suffix so a crashed previous run never collides on unique columns.
  const run = randomUUID().slice(0, 8);

  const user1Id = randomUUID();
  const user2Id = randomUUID();
  const user3Id = randomUUID();
  const user4Id = randomUUID();

  await db.insert(schema.user).values([
    {
      id: user1Id,
      email: `user1-${run}@test.local`,
      name: "User One",
      emailVerified: true,
      createdAt: new Date("2026-10-17T10:00:00Z"),
    },
    {
      id: user2Id,
      email: `user2-${run}@test.local`,
      name: "User Two",
      emailVerified: true,
      createdAt: new Date("2026-10-18T10:00:00Z"),
    },
    {
      id: user3Id,
      email: `user3-${run}@test.local`,
      name: "User Three",
      emailVerified: false,
      createdAt: new Date("2026-10-19T10:00:00Z"),
    },
    {
      id: user4Id,
      email: `user4-${run}@test.local`,
      name: "User Four",
      emailVerified: true,
      createdAt: new Date("2026-10-20T10:00:00Z"),
    },
  ]);

  // Email verification tokens (consumed). user4 has TWO consumed tokens: the metric
  // must count the user once (COUNT DISTINCT) and use the earliest token (MIN) for the median.
  const tok1 = randomUUID();
  const tok2 = randomUUID();
  const tok3a = randomUUID();
  const tok3b = randomUUID();
  await db.insert(schema.emailToken).values([
    {
      id: tok1,
      tokenHash: `hash1-${run}`,
      userId: user1Id,
      purpose: "verify",
      consumedAt: new Date("2026-10-17T12:00:00Z"), // 2 hours after signup
      expiresAt: new Date("2026-10-18T10:00:00Z"),
      createdAt: new Date("2026-10-17T10:00:00Z"),
    },
    {
      id: tok2,
      tokenHash: `hash2-${run}`,
      userId: user2Id,
      purpose: "verify",
      consumedAt: new Date("2026-10-18T14:00:00Z"), // 4 hours after signup
      expiresAt: new Date("2026-10-19T10:00:00Z"),
      createdAt: new Date("2026-10-18T10:00:00Z"),
    },
    {
      id: tok3a,
      tokenHash: `hash3a-${run}`,
      userId: user4Id,
      purpose: "verify",
      consumedAt: new Date("2026-10-20T11:00:00Z"), // 1 hour after signup
      expiresAt: new Date("2026-10-21T10:00:00Z"),
      createdAt: new Date("2026-10-20T10:00:00Z"),
    },
    {
      id: tok3b,
      tokenHash: `hash3b-${run}`,
      userId: user4Id,
      purpose: "verify",
      consumedAt: new Date("2026-10-20T13:00:00Z"), // 3 hours after signup
      expiresAt: new Date("2026-10-21T10:00:00Z"),
      createdAt: new Date("2026-10-20T10:00:00Z"),
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
      slug: `ws-1-${run}`,
      createdBy: user1Id,
      createdAt: new Date("2026-10-17T14:30:00Z"), // Same day as onboarding
    },
    {
      id: ws2Id,
      name: "Workspace 2",
      slug: `ws-2-${run}`,
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
  const runIds: string[] = [];
  const mkRun = (row: {
    number: number;
    status: "succeeded" | "failed" | "queued";
    createdAt: Date;
    startedAt?: Date;
    finishedAt?: Date;
    triggerKind?: "manual" | "webhook";
    triggerRef?: string;
  }) => {
    const id = randomUUID();
    runIds.push(id);
    return { id, workspaceId: ws1Id, flowId: flow1Id, flowVersionId, ...row };
  };

  await db.insert(schema.run).values([
    mkRun({
      number: 1,
      status: "succeeded",
      createdAt: new Date("2026-10-17T12:00:00Z"),
      startedAt: new Date("2026-10-17T12:00:05Z"), // 5s queue-to-start
      finishedAt: new Date("2026-10-17T12:00:15Z"),
    }),
    mkRun({
      number: 2,
      status: "succeeded",
      createdAt: new Date("2026-10-17T13:00:00Z"),
      startedAt: new Date("2026-10-17T13:00:10Z"), // 10s queue-to-start
      finishedAt: new Date("2026-10-17T13:00:20Z"),
    }),
    mkRun({
      number: 3,
      status: "succeeded",
      createdAt: new Date("2026-10-17T14:00:00Z"),
      startedAt: new Date("2026-10-17T14:00:15Z"), // 15s queue-to-start
      finishedAt: new Date("2026-10-17T14:00:25Z"),
    }),
    mkRun({
      number: 4,
      status: "succeeded",
      createdAt: new Date("2026-10-18T10:00:00Z"),
      startedAt: new Date("2026-10-18T10:00:20Z"), // 20s queue-to-start
      finishedAt: new Date("2026-10-18T10:00:30Z"),
    }),
    mkRun({
      number: 5,
      status: "succeeded",
      createdAt: new Date("2026-10-18T11:00:00Z"),
      startedAt: new Date("2026-10-18T11:00:25Z"), // 25s queue-to-start
      finishedAt: new Date("2026-10-18T11:00:35Z"),
    }),
    mkRun({
      number: 6,
      status: "failed",
      createdAt: new Date("2026-10-18T12:00:00Z"),
      startedAt: new Date("2026-10-18T12:00:30Z"), // 30s queue-to-start
      finishedAt: new Date("2026-10-18T12:00:35Z"),
    }),
    mkRun({
      number: 7,
      status: "failed",
      createdAt: new Date("2026-10-19T10:00:00Z"),
      startedAt: new Date("2026-10-19T10:00:40Z"), // 40s queue-to-start
      finishedAt: new Date("2026-10-19T10:00:45Z"),
    }),
    mkRun({
      number: 8,
      status: "queued",
      createdAt: new Date("2026-10-19T11:00:00Z"),
    }),
  ]);

  // Webhook endpoint
  const webhookEpId = randomUUID();
  await db.insert(schema.webhookEndpoint).values({
    id: webhookEpId,
    flowId: flow1Id,
    workspaceId: ws1Id,
    token: `test-token-${run}`,
    secretEnc: "enc",
    keyId: "key1",
    active: true,
    createdAt: new Date("2026-10-17T10:00:00Z"),
  });

  // Webhook events: 2 accepted (created runs) + 3 rejected.
  // evt3 is a duplicate rejection INSIDE the range (counted); evt4 is a
  // "flow not published" rejection (NOT counted — different reason); evt5 is a
  // duplicate rejection OUTSIDE the range (NOT counted — received_at filter).
  const evt1 = `evt-${randomUUID().slice(0, 8)}`;
  const evt2 = `evt-${randomUUID().slice(0, 8)}`;
  const evt3 = `evt-${randomUUID().slice(0, 8)}`;
  const evt4 = `evt-${randomUUID().slice(0, 8)}`;
  const evt5 = `evt-${randomUUID().slice(0, 8)}`;

  const runForWebhook1 = mkRun({
    number: 9,
    status: "succeeded",
    triggerKind: "webhook",
    triggerRef: evt1,
    createdAt: new Date("2026-10-17T15:00:00Z"),
    startedAt: new Date("2026-10-17T15:00:01Z"),
    finishedAt: new Date("2026-10-17T15:00:05Z"),
  });
  const runForWebhook2 = mkRun({
    number: 10,
    status: "succeeded",
    triggerKind: "webhook",
    triggerRef: evt2,
    createdAt: new Date("2026-10-18T10:00:00Z"),
    startedAt: new Date("2026-10-18T10:00:01Z"),
    finishedAt: new Date("2026-10-18T10:00:05Z"),
  });
  await db.insert(schema.run).values([runForWebhook1, runForWebhook2]);

  const webhookEvents = await db
    .insert(schema.webhookEvent)
    .values([
      {
        endpointId: webhookEpId,
        eventId: evt1,
        bodySha256: "sha1",
        signedAt: new Date("2026-10-17T15:00:00Z"),
        receivedAt: new Date("2026-10-17T15:00:00Z"),
        runId: runForWebhook1.id,
        status: "accepted",
        detail: null,
        signature: `sig1-${run}`,
      },
      {
        endpointId: webhookEpId,
        eventId: evt2,
        bodySha256: "sha2",
        signedAt: new Date("2026-10-18T10:00:00Z"),
        receivedAt: new Date("2026-10-18T10:00:00Z"),
        runId: runForWebhook2.id,
        status: "accepted",
        detail: null,
        signature: `sig2-${run}`,
      },
      {
        endpointId: webhookEpId,
        eventId: evt3,
        bodySha256: "sha3",
        signedAt: new Date("2026-10-17T16:00:00Z"),
        receivedAt: new Date("2026-10-17T16:00:00Z"), // In range
        runId: null, // Rejected duplicates never have a run
        status: "rejected",
        detail: "duplicate",
        signature: `sig3-${run}`,
      },
      {
        endpointId: webhookEpId,
        eventId: evt4,
        bodySha256: "sha4",
        signedAt: new Date("2026-10-17T17:00:00Z"),
        receivedAt: new Date("2026-10-17T17:00:00Z"), // In range, but NOT a duplicate
        runId: null,
        status: "rejected",
        detail: "flow not published",
        signature: `sig4-${run}`,
      },
      {
        endpointId: webhookEpId,
        eventId: evt5,
        bodySha256: "sha5",
        signedAt: new Date("2026-10-15T10:00:00Z"),
        receivedAt: new Date("2026-10-15T10:00:00Z"), // Out of range
        runId: null,
        status: "rejected",
        detail: "duplicate",
        signature: `sig5-${run}`,
      },
    ])
    .returning({ id: schema.webhookEvent.id });
  const webhookEventIds = webhookEvents.map((e) => e.id);

  // Approvals for workflow runs
  const appr1 = randomUUID();
  const appr2 = randomUUID();
  const appr3 = randomUUID();
  await db.insert(schema.approval).values([
    {
      id: appr1,
      workspaceId: ws1Id,
      runId: runForWebhook1.id,
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
      id: appr2,
      workspaceId: ws1Id,
      runId: runForWebhook2.id,
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
      id: appr3,
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
  const [audit] = await db
    .insert(schema.platformAuditEvent)
    .values({
      actorUserId: user1Id,
      actorLabel: `user1-${run}@test.local`,
      assurance: "session",
      action: "admin.access_denied",
      result: "denied",
      at: new Date("2026-10-17T16:00:00Z"),
    })
    .returning({ id: schema.platformAuditEvent.id });

  return {
    userIds: [user1Id, user2Id, user3Id, user4Id],
    emailTokenIds: [tok1, tok2, tok3a, tok3b],
    userSettingsIds: [user1Id, user2Id, user3Id], // user_settings.user_id is the PK
    workspaceIds: [ws1Id, ws2Id],
    flowIds: [flow1Id, flow2Id],
    flowVersionIds: [flowVersionId],
    runIds,
    webhookEndpointIds: [webhookEpId],
    webhookEventIds,
    approvalIds: [appr1, appr2, appr3],
    auditIds: [audit.id],
  };
}

/** Delete exactly the rows seeded by this run — never a whole table. */
async function cleanupTestData(ids: SeededIds) {
  // Reverse order of dependencies; every delete is scoped to seeded IDs.
  if (ids.auditIds.length > 0) {
    await db.delete(schema.platformAuditEvent).where(inArray(schema.platformAuditEvent.id, ids.auditIds));
  }
  if (ids.approvalIds.length > 0) {
    await db.delete(schema.approval).where(inArray(schema.approval.id, ids.approvalIds));
  }
  if (ids.webhookEventIds.length > 0) {
    await db.delete(schema.webhookEvent).where(inArray(schema.webhookEvent.id, ids.webhookEventIds));
  }
  if (ids.webhookEndpointIds.length > 0) {
    await db.delete(schema.webhookEndpoint).where(inArray(schema.webhookEndpoint.id, ids.webhookEndpointIds));
  }
  if (ids.runIds.length > 0) {
    await db.delete(schema.run).where(inArray(schema.run.id, ids.runIds));
  }
  if (ids.flowVersionIds.length > 0) {
    await db.delete(schema.flowVersion).where(inArray(schema.flowVersion.id, ids.flowVersionIds));
  }
  if (ids.flowIds.length > 0) {
    await db.delete(schema.flow).where(inArray(schema.flow.id, ids.flowIds));
  }
  if (ids.workspaceIds.length > 0) {
    await db.delete(schema.workspace).where(inArray(schema.workspace.id, ids.workspaceIds));
  }
  if (ids.emailTokenIds.length > 0) {
    await db.delete(schema.emailToken).where(inArray(schema.emailToken.id, ids.emailTokenIds));
  }
  if (ids.userSettingsIds.length > 0) {
    await db.delete(schema.userSettings).where(inArray(schema.userSettings.userId, ids.userSettingsIds));
  }
  if (ids.userIds.length > 0) {
    await db.delete(schema.user).where(inArray(schema.user.id, ids.userIds));
  }
}

describe("pilot-metrics", () => {
  let seeded: SeededIds;

  beforeAll(async () => {
    seeded = await seedTestData();
  });

  afterAll(async () => {
    await cleanupTestData(seeded);
    await pool.end();
  });

  it("collects sign-ups and median time to verified correctly", async () => {
    const metrics = await collectPilotMetrics(db, TEST_FROM, TEST_TO);

    // 4 distinct users created in date range (user4 has two consumed tokens but counts once)
    expect(metrics.signups).toBe(4);
    // Median of per-user first-token times: user1=2h, user2=4h, user4=1h (earliest of 1h/3h) → median 2h
    expect(metrics.medianHoursToVerified).toBeCloseTo(2, 1);
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

  it("counts duplicate webhook runs by received_at and detail, not by run join", async () => {
    const metrics = await collectPilotMetrics(db, TEST_FROM, TEST_TO);

    // evt3: rejected duplicate in range -> counted.
    // evt4: rejected "flow not published" in range -> not a duplicate, not counted.
    // evt5: rejected duplicate out of range -> not counted.
    expect(metrics.duplicateWebhookRuns).toBe(1);

    // Sanity: the accepted webhook runs and approvals are unchanged.
    expect(metrics.webhookRuns).toBe(2);
    expect(metrics.approvals).toBe(2);
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
