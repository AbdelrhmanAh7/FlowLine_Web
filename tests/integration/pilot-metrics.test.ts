import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { db, pool, schema } from "@/db";
import { collectPilotMetrics, formatMetricsAsMarkdown } from "../../scripts/pilot-metrics";

// A synthetic window far from real dates: rows from other suites or the live pilot week
// can never fall inside it, so the exact assertions below are deterministic.
const TEST_FROM = new Date("2001-03-16T00:00:00Z");
const TEST_TO = new Date("2001-03-23T23:59:59.999Z");

/**
 * Every ID seeded by one run. Cleanup deletes ONLY these rows (never the whole DB),
 * and every seeded timestamp is in the synthetic 2001-03 window, so it cannot race other suites.
 */
interface SeededIds {
  userIds: string[];
  emailTokenIds: string[];
  userSettingsIds: string[];
  workspaceIds: string[];
  flowIds: string[];
  flowVersionIds: string[];
  runIds: string[];
  webhookRunId: string;
  webhookEndpointIds: string[];
  webhookEventIds: number[];
  approvalIds: string[];
}

async function seedTestData(): Promise<SeededIds> {
  // Run-specific suffix so a crashed previous run never collides on unique columns.
  const run = randomUUID().slice(0, 8);

  const user1Id = randomUUID();
  const user2Id = randomUUID();
  const user3Id = randomUUID();
  const user4Id = randomUUID();
  const user5Id = randomUUID(); // signed up BEFORE the range: must never be counted

  await db.insert(schema.user).values([
    {
      id: user1Id,
      email: `user1-${run}@test.local`,
      name: "User One",
      emailVerified: true,
      createdAt: new Date("2001-03-17T10:00:00Z"),
    },
    {
      id: user2Id,
      email: `user2-${run}@test.local`,
      name: "User Two",
      emailVerified: true,
      createdAt: new Date("2001-03-18T10:00:00Z"),
    },
    {
      id: user3Id,
      email: `user3-${run}@test.local`,
      name: "User Three",
      emailVerified: false,
      createdAt: new Date("2001-03-19T10:00:00Z"),
    },
    {
      id: user4Id,
      email: `user4-${run}@test.local`,
      name: "User Four",
      emailVerified: true,
      createdAt: new Date("2001-03-20T10:00:00Z"),
    },
    {
      id: user5Id,
      email: `user5-${run}@test.local`,
      name: "User Five",
      emailVerified: true,
      createdAt: new Date("2001-03-10T10:00:00Z"),
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
      consumedAt: new Date("2001-03-17T12:00:00Z"), // 2 hours after signup
      expiresAt: new Date("2001-03-18T10:00:00Z"),
      createdAt: new Date("2001-03-17T10:00:00Z"),
    },
    {
      id: tok2,
      tokenHash: `hash2-${run}`,
      userId: user2Id,
      purpose: "verify",
      consumedAt: new Date("2001-03-18T14:00:00Z"), // 4 hours after signup
      expiresAt: new Date("2001-03-19T10:00:00Z"),
      createdAt: new Date("2001-03-18T10:00:00Z"),
    },
    {
      id: tok3a,
      tokenHash: `hash3a-${run}`,
      userId: user4Id,
      purpose: "verify",
      consumedAt: new Date("2001-03-20T11:00:00Z"), // 1 hour after signup
      expiresAt: new Date("2001-03-21T10:00:00Z"),
      createdAt: new Date("2001-03-20T10:00:00Z"),
    },
    {
      id: tok3b,
      tokenHash: `hash3b-${run}`,
      userId: user4Id,
      purpose: "verify",
      consumedAt: new Date("2001-03-20T13:00:00Z"), // 3 hours after signup
      expiresAt: new Date("2001-03-21T10:00:00Z"),
      createdAt: new Date("2001-03-20T10:00:00Z"),
    },
  ]);

  // user1 finishes onboarding on day 1; user2 too, but creates the workspace after 24h;
  // user3 SKIPPED onboarding (the real skip path also writes a completion time and a workspace);
  // user5 signed up before the range and finished onboarding inside it.
  await db.insert(schema.userSettings).values([
    { userId: user1Id, onboardingCompletedAt: new Date("2001-03-17T14:00:00Z"), onboardingSkipped: false },
    { userId: user2Id, onboardingCompletedAt: new Date("2001-03-18T15:00:00Z"), onboardingSkipped: false },
    { userId: user3Id, onboardingCompletedAt: new Date("2001-03-19T10:20:00Z"), onboardingSkipped: true },
    { userId: user5Id, onboardingCompletedAt: new Date("2001-03-17T09:00:00Z"), onboardingSkipped: false },
  ]);

  const ws1Id = randomUUID();
  const ws2Id = randomUUID();
  const ws3Id = randomUUID();
  const ws5Id = randomUUID();
  await db.insert(schema.workspace).values([
    { id: ws1Id, name: "Workspace 1", slug: `ws-1-${run}`, createdBy: user1Id, createdAt: new Date("2001-03-17T14:30:00Z") },
    { id: ws2Id, name: "Workspace 2", slug: `ws-2-${run}`, createdBy: user2Id, createdAt: new Date("2001-03-19T11:00:00Z") }, // 25h after sign-up
    { id: ws3Id, name: "Workspace 3", slug: `ws-3-${run}`, createdBy: user3Id, createdAt: new Date("2001-03-19T10:30:00Z") },
    { id: ws5Id, name: "Workspace 5", slug: `ws-5-${run}`, createdBy: user5Id, createdAt: new Date("2001-03-17T09:30:00Z") },
  ]);

  // Flows. The publish pointer and updated_at are deliberately misleading: the metric reads
  // the immutable publish snapshots, so they must not matter.
  const mkFlow = (workspaceId: string, name: string) => ({ id: randomUUID(), workspaceId, name, graph: { nodes: [], edges: [] } });
  const flow1 = mkFlow(ws1Id, "Published day 1 (user1)");
  const flow2 = mkFlow(ws2Id, "Published day 0, republished day 5 (user2)");
  const flow4 = mkFlow(ws1Id, "First published on day 6 (user4)");
  const flow5 = mkFlow(ws5Id, "Published by a pre-range user (user5)");
  const flow2Id = flow2.id;
  const flow1Id = flow1.id;
  await db.insert(schema.flow).values([flow1, { ...flow2, updatedAt: new Date("2001-03-28T10:00:00Z") }, flow4, flow5]);

  const flowVersionId = randomUUID();
  const mkVersion = (flowId: string, version: number, createdBy: string, createdAt: string, id = randomUUID()) => ({
    id,
    flowId,
    version,
    revision: version,
    name: "Flow",
    graph: { nodes: [], edges: [] },
    reason: "publish",
    createdBy,
    createdAt: new Date(createdAt),
  });
  const extraVersionIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  await db.insert(schema.flowVersion).values([
    mkVersion(flow1Id, 1, user1Id, "2001-03-18T10:00:00Z", flowVersionId), // user1: +1 day -> counts
    mkVersion(flow2Id, 1, user2Id, "2001-03-18T12:00:00Z", extraVersionIds[0]), // user2: day 0 -> counts
    mkVersion(flow2Id, 2, user2Id, "2001-03-23T10:00:00Z", extraVersionIds[1]), // republished on day 5: first publish still counts once
    mkVersion(flow4.id, 1, user4Id, "2001-03-26T10:00:00Z", extraVersionIds[2]), // user4: +6 days -> does not count
    mkVersion(flow5.id, 1, user5Id, "2001-03-17T12:00:00Z", extraVersionIds[3]), // user5 signed up before range -> does not count
  ]);

  // Runs: 7 succeeded + 2 failed counted in the success rate; 1 queued is not.
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
      createdAt: new Date("2001-03-17T12:00:00Z"),
      startedAt: new Date("2001-03-17T12:00:05Z"), // 5s queue-to-start
      finishedAt: new Date("2001-03-17T12:00:15Z"),
    }),
    mkRun({
      number: 2,
      status: "succeeded",
      createdAt: new Date("2001-03-17T13:00:00Z"),
      startedAt: new Date("2001-03-17T13:00:10Z"), // 10s queue-to-start
      finishedAt: new Date("2001-03-17T13:00:20Z"),
    }),
    mkRun({
      number: 3,
      status: "succeeded",
      createdAt: new Date("2001-03-17T14:00:00Z"),
      startedAt: new Date("2001-03-17T14:00:15Z"), // 15s queue-to-start
      finishedAt: new Date("2001-03-17T14:00:25Z"),
    }),
    mkRun({
      number: 4,
      status: "succeeded",
      createdAt: new Date("2001-03-18T10:00:00Z"),
      startedAt: new Date("2001-03-18T10:00:20Z"), // 20s queue-to-start
      finishedAt: new Date("2001-03-18T10:00:30Z"),
    }),
    mkRun({
      number: 5,
      status: "succeeded",
      createdAt: new Date("2001-03-18T11:00:00Z"),
      startedAt: new Date("2001-03-18T11:00:25Z"), // 25s queue-to-start
      finishedAt: new Date("2001-03-18T11:00:35Z"),
    }),
    mkRun({
      number: 6,
      status: "failed",
      createdAt: new Date("2001-03-18T12:00:00Z"),
      startedAt: new Date("2001-03-18T12:00:30Z"), // 30s queue-to-start
      finishedAt: new Date("2001-03-18T12:00:35Z"),
    }),
    mkRun({
      number: 7,
      status: "failed",
      createdAt: new Date("2001-03-19T10:00:00Z"),
      startedAt: new Date("2001-03-19T10:00:40Z"), // 40s queue-to-start
      finishedAt: new Date("2001-03-19T10:00:45Z"),
    }),
    mkRun({
      number: 8,
      status: "queued",
      createdAt: new Date("2001-03-19T11:00:00Z"),
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
    createdAt: new Date("2001-03-17T10:00:00Z"),
  });

  // Webhook events: 2 accepted (created runs) + 1 rejected "duplicate" row. The hook route
  // never writes such a row, and the duplicate metric must not read it: it counts runs.
  const evt1 = `evt-${randomUUID().slice(0, 8)}`;
  const evt2 = `evt-${randomUUID().slice(0, 8)}`;
  const evt3 = `evt-${randomUUID().slice(0, 8)}`;

  const runForWebhook1 = mkRun({
    number: 9,
    status: "succeeded",
    triggerKind: "webhook",
    triggerRef: evt1,
    createdAt: new Date("2001-03-17T15:00:00Z"),
    startedAt: new Date("2001-03-17T15:00:01Z"),
    finishedAt: new Date("2001-03-17T15:00:05Z"),
  });
  const runForWebhook2 = mkRun({
    number: 10,
    status: "succeeded",
    triggerKind: "webhook",
    triggerRef: evt2,
    createdAt: new Date("2001-03-18T10:00:00Z"),
    startedAt: new Date("2001-03-18T10:00:01Z"),
    finishedAt: new Date("2001-03-18T10:00:05Z"),
  });
  await db.insert(schema.run).values([runForWebhook1, runForWebhook2]);

  const webhookEvents = await db
    .insert(schema.webhookEvent)
    .values([
      {
        endpointId: webhookEpId,
        eventId: evt1,
        bodySha256: "sha1",
        signedAt: new Date("2001-03-17T15:00:00Z"),
        receivedAt: new Date("2001-03-17T15:00:00Z"),
        runId: runForWebhook1.id,
        status: "accepted",
        detail: null,
        signature: `sig1-${run}`,
      },
      {
        endpointId: webhookEpId,
        eventId: evt2,
        bodySha256: "sha2",
        signedAt: new Date("2001-03-18T10:00:00Z"),
        receivedAt: new Date("2001-03-18T10:00:00Z"),
        runId: runForWebhook2.id,
        status: "accepted",
        detail: null,
        signature: `sig2-${run}`,
      },
      {
        endpointId: webhookEpId,
        eventId: evt3,
        bodySha256: "sha3",
        signedAt: new Date("2001-03-17T16:00:00Z"),
        receivedAt: new Date("2001-03-17T16:00:00Z"),
        runId: null,
        status: "rejected",
        detail: "duplicate",
        signature: `sig3-${run}`,
      },
    ])
    .returning({ id: schema.webhookEvent.id });
  const webhookEventIds = webhookEvents.map((e) => e.id);

  // Approvals for workflow runs
  const appr1 = randomUUID();
  const appr2 = randomUUID();
  const appr3 = randomUUID();
  const appr4 = randomUUID();
  const appr5 = randomUUID();
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
      requestedAt: new Date("2001-03-17T15:00:00Z"),
      expiresAt: new Date("2001-03-18T15:00:00Z"),
      decidedAt: new Date("2001-03-17T15:00:30Z"),
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
      requestedAt: new Date("2001-03-18T10:00:00Z"),
      expiresAt: new Date("2001-03-19T10:00:00Z"),
      decidedAt: new Date("2001-03-18T10:00:30Z"),
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
      requestedAt: new Date("2001-03-18T12:00:00Z"),
      expiresAt: new Date("2001-03-19T12:00:00Z"),
    },
    {
      // Workflow approval still pending in range: not a decision, not counted.
      id: appr4,
      workspaceId: ws1Id,
      runId: runForWebhook1.id,
      flowVersionId,
      nodeId: "node-4",
      kind: "approval",
      actionId: "send_email",
      argsHash: "hash4",
      status: "pending",
      requestedAt: new Date("2001-03-18T12:00:00Z"),
      expiresAt: new Date("2001-03-19T12:00:00Z"),
    },
    {
      // Decided after the range ends: not counted, whatever the run's creation time.
      id: appr5,
      workspaceId: ws1Id,
      runId: runForWebhook2.id,
      flowVersionId,
      nodeId: "node-5",
      kind: "approval",
      actionId: "send_email",
      argsHash: "hash5",
      status: "approved",
      requestedAt: new Date("2001-03-18T12:00:00Z"),
      expiresAt: new Date("2001-03-30T12:00:00Z"),
      decidedAt: new Date("2001-03-29T12:00:00Z"),
    },
  ]);

  return {
    userIds: [user1Id, user2Id, user3Id, user4Id, user5Id],
    emailTokenIds: [tok1, tok2, tok3a, tok3b],
    userSettingsIds: [user1Id, user2Id, user3Id, user5Id], // user_settings.user_id is the PK
    workspaceIds: [ws1Id, ws2Id, ws3Id, ws5Id],
    flowIds: [flow1.id, flow2.id, flow4.id, flow5.id],
    flowVersionIds: [flowVersionId, ...extraVersionIds],
    runIds,
    webhookRunId: runForWebhook1.id,
    webhookEndpointIds: [webhookEpId],
    webhookEventIds,
    approvalIds: [appr1, appr2, appr3, appr4, appr5],
  };
}

/** Delete exactly the rows seeded by this run — never a whole table. */
async function cleanupTestData(ids: SeededIds) {
  // Reverse order of dependencies; every delete is scoped to seeded IDs.
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
  let seeded: SeededIds | undefined;

  beforeAll(async () => {
    seeded = await seedTestData();
  });

  afterAll(async () => {
    try {
      if (seeded) await cleanupTestData(seeded);
    } finally {
      await pool.end();
    }
  });

  it("counts sign-ups once per user and takes the median of each user's first verification", async () => {
    const metrics = await collectPilotMetrics(db, TEST_FROM, TEST_TO);

    // 4 users signed up in range (user5 signed up before it); user4 has two tokens but counts once.
    expect(metrics.signups).toBe(4);
    // Per-user first verification: user1=2h, user2=4h, user4=1h (earliest of 1h/3h); user3 never verified -> median 2h.
    expect(metrics.medianHoursToVerified).toBeCloseTo(2, 1);
  });

  it("reports run success rate and p95 queue-to-start over finished runs", async () => {
    const metrics = await collectPilotMetrics(db, TEST_FROM, TEST_TO);

    // 7 succeeded, 2 failed; the queued run is not finished.
    expect(metrics.runSuccessRate).toBeCloseTo(7 / 9, 5);
    // Queue-to-start seconds of the 9 started runs: 1,1,5,10,15,20,25,30,40 -> p95 = 30 + 0.6 * 10 = 36s.
    expect(metrics.p95QueueToStartMs).toBeCloseTo(36_000, 0);
  });

  it("counts onboarding + workspace within 24h of sign-up, excluding skippers and earlier cohorts", async () => {
    const metrics = await collectPilotMetrics(db, TEST_FROM, TEST_TO);

    // user1 yes. user2: workspace 25h after sign-up. user3: skipped onboarding (completion time is set on skip).
    // user5: finished onboarding inside the range but signed up before it.
    expect(metrics.onboardingAndWorkspaceDay1).toBe(1);
  });

  it("counts a first publication within 3 days of sign-up from immutable publish versions", async () => {
    const metrics = await collectPilotMetrics(db, TEST_FROM, TEST_TO);

    // user1 (+1 day) yes. user2 published on day 0 and republished on day 5: counted once, flow.updated_at ignored.
    // user4 first published on day 6: no. user5 signed up before the range: no.
    expect(metrics.publishedFlowWithin3Days).toBe(2);
  });

  it("counts accepted webhook runs and decided workflow approvals in range", async () => {
    const metrics = await collectPilotMetrics(db, TEST_FROM, TEST_TO);

    expect(metrics.webhookRuns).toBe(2);
    // appr1+appr2 decided in range. Not counted: the agent review, a still-pending approval, one decided after the range.
    expect(metrics.approvals).toBe(2);
  });

  it("counts a webhook trigger_ref that produced two runs as one duplicate (and 0 otherwise)", async () => {
    const clean = await collectPilotMetrics(db, TEST_FROM, TEST_TO);
    // The seeded rejected "duplicate" webhook_event row is ignored; runs are unique per event.
    expect(clean.duplicateWebhookRuns).toBe(0);

    // run_trigger_unique makes a duplicate impossible, so drop it inside a transaction that is
    // always rolled back (DDL is transactional in Postgres) to prove the metric would notice one.
    class Rollback extends Error {}
    let duplicates: number | undefined;
    await expect(
      db.transaction(async (tx) => {
        await tx.execute(sql`DROP INDEX run_trigger_unique`);
        const [original] = await tx.select().from(schema.run).where(eq(schema.run.id, seeded!.webhookRunId));
        await tx.insert(schema.run).values({ ...original!, id: randomUUID(), number: 99 });
        duplicates = (await collectPilotMetrics(tx, TEST_FROM, TEST_TO)).duplicateWebhookRuns;
        throw new Rollback();
      }),
    ).rejects.toThrow(Rollback);
    expect(duplicates).toBe(1);

    const [{ n }] = (await db.execute(sql`SELECT COUNT(*)::int AS n FROM pg_indexes WHERE indexname = 'run_trigger_unique'`)).rows as { n: number }[];
    expect(n).toBe(1); // rollback restored the index
  });

  it("prints every metric as 0 or N/A on a range with no data", async () => {
    const metrics = await collectPilotMetrics(db, new Date("1999-01-01T00:00:00Z"), new Date("1999-01-02T23:59:59.999Z"));

    expect(metrics).toMatchObject({
      signups: 0,
      onboardingAndWorkspaceDay1: 0,
      publishedFlowWithin3Days: 0,
      webhookRuns: 0,
      approvals: 0,
      duplicateWebhookRuns: 0,
    });
    expect(metrics.runSuccessRate).toBeNull();
    expect(metrics.medianHoursToVerified).toBeNull();
    expect(metrics.p95QueueToStartMs).toBeNull();
    const markdown = formatMetricsAsMarkdown(metrics, TEST_FROM, TEST_TO);
    expect(markdown).toContain("| Sign-ups | 0 |");
  });

  it("formats metrics as a Markdown table with no connection string", async () => {
    const metrics = await collectPilotMetrics(db, TEST_FROM, TEST_TO);
    const markdown = formatMetricsAsMarkdown(metrics, TEST_FROM, TEST_TO);

    expect(markdown).toContain("# Pilot Metrics: 2001-03-16 to 2001-03-23");
    expect(markdown).toContain("| Metric | Value |");
    expect(markdown).toContain(`| Sign-ups | ${metrics.signups} |`);
    expect(markdown).toContain(`| Run success rate | 77.8% |`);
    expect(markdown).not.toMatch(/postgres(ql)?:\/\//);
  });
});
