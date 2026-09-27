import { expect } from "vitest";
import { ProviderError, type ProviderId } from "@/integrations/types";
import type { CertSession } from "./framework";

/**
 * One certification scenario per SaaS provider. Each records these checks separately:
 * connect, identity, read, write, verify, cleanup, revocation, errors.
 * Writes target dedicated test resources only; cleanups delete/archive what was created.
 * Calls not exposed by an adapter go through the adapter's ctx.http directly (same egress
 * and auth path) — no adapter behaviour is changed by this suite.
 */

type Scenario = (s: CertSession) => Promise<void>;

// ---------------------------------------------------------------- shared checks

async function connectAndIdentity(s: CertSession): Promise<void> {
  await s.check("connect", async () => {
    // Credential construction already happened in buildSession; this proves the provider
    // accepts them. (Token refresh is not exercised: the env inputs carry access tokens only.)
    const who = await s.provider.identity(s.ctx());
    return { account: who.label };
  });
  await s.check("identity", async () => {
    const who = await s.provider.identity(s.ctx());
    expect(who.accountId).toBeTruthy();
    expect(who.label).toBeTruthy();
    return { accountId: who.accountId, label: who.label };
  });
}

async function revocation(s: CertSession): Promise<void> {
  await s.check(
    "revocation",
    async () => {
      const err = await s.provider.identity(s.ctx(s.revoked!)).then(
        () => null,
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(ProviderError);
      expect((err as ProviderError).kind).toBe("auth");
      return { kind: "auth" };
    },
    { skip: s.revoked ? undefined : `missing revoked credential (${s.envBase}_REVOKED)` },
  );
}

/** Asserts a promise rejects with a ProviderError of the expected kind; returns the error. */
async function expectKind(promise: Promise<unknown>, kind: string): Promise<ProviderError> {
  const err = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(ProviderError);
  expect((err as ProviderError).kind).toBe(kind);
  expect((err as ProviderError).message.length).toBeGreaterThan(0);
  return err as ProviderError;
}

const missing = () => `${randomSuffix()}`;
let counter = 0;
function randomSuffix(): string {
  return `${Date.now().toString(36)}-${(counter++).toString(36)}`;
}

// ---------------------------------------------------------------- google_sheets

const googleSheets: Scenario = async (s) => {
  await connectAndIdentity(s);
  const t = s.target;
  const range = (r: string) => `${t!.tab}!${r}`;
  const wctx = s.creds ? s.ctx() : undefined;
  const readInput = () => ({ spreadsheetId: t!.spreadsheetId, range: range("A1:Z100") });

  await s.check(
    "read",
    async () => {
      const out = await s.run<{ values: string[][] }>("google_sheets.read_range", readInput());
      return { rows: out.values.length };
    },
    { needsTarget: true },
  );

  const wrote = await s.check(
    "write",
    async () => {
      const out = await s.run<{ updatedRange: string; updatedRows: number }>(
        "google_sheets.append_row",
        { spreadsheetId: t!.spreadsheetId, range: range("A1"), row: [s.marker, "flowline-cert", new Date().toISOString()] },
        wctx,
      );
      expect(out.updatedRows).toBe(1);
      return { updatedRange: out.updatedRange };
    },
    { needsTarget: true },
  );

  await s.check(
    "verify",
    async () => {
      const v = await s.verifyAction(
        "google_sheets.append_row",
        { spreadsheetId: t!.spreadsheetId, range: range("A1"), row: [s.marker, "flowline-cert", ""] },
        wctx!,
      );
      expect(v.happened).toBe(true);
      const out = await s.run<{ values: string[][] }>("google_sheets.read_range", readInput());
      const row = out.values.find((r) => r.includes(s.marker));
      expect(row, "appended row is readable").toBeTruthy();
      expect(row![0]).toBe(s.marker);
      expect(row![1]).toBe("flowline-cert");
      return { row: row!.slice(0, 2) };
    },
    { needsTarget: true, skip: wrote ? undefined : "write did not complete" },
  );

  await s.check(
    "cleanup",
    async () => {
      const before = await s.run<{ values: string[][] }>("google_sheets.read_range", readInput());
      const idx = before.values.findIndex((r) => r.includes(s.marker));
      expect(idx).toBeGreaterThanOrEqual(0);
      // No adapter action deletes rows; clear the appended row via the Sheets API directly.
      await s.ctx().http.request({
        method: "POST",
        path: `/v4/spreadsheets/${t!.spreadsheetId}/values/${encodeURIComponent(`${t!.tab}!A${idx + 1}:Z${idx + 1}`)}:clear`,
      });
      const after = await s.run<{ values: string[][] }>("google_sheets.read_range", readInput());
      expect(after.values.some((r) => r.includes(s.marker))).toBe(false);
      return { clearedRow: idx + 1 };
    },
    { needsTarget: true, skip: wrote ? undefined : "write did not complete" },
  );

  await s.check("errors", async () => {
    const err = await expectKind(s.run("google_sheets.read_range", { spreadsheetId: `missing-${missing()}`, range: "A1:A1" }), "not_found");
    return { kind: err.kind };
  });

  await revocation(s);
};

// ---------------------------------------------------------------- gmail

const gmail: Scenario = async (s) => {
  await connectAndIdentity(s);
  const wctx = s.creds ? s.ctx() : undefined;

  await s.check("read", async () => {
    const out = await s.run<{ resultSizeEstimate: number }>("gmail.search_messages", { q: "in:inbox", maxResults: 5 });
    return { estimate: out.resultSizeEstimate };
  });

  const writeInput = { to: "", subject: s.marker, body: "Flowline live certification — this message is safe to delete." };
  const wrote = await s.check("write", async () => {
    // Send to self (or an explicit FLOWLINE_LIVE_GMAIL_TARGET {"to": "…"}).
    writeInput.to = s.target?.to ?? (await s.provider.identity(s.ctx())).label;
    const out = await s.run<{ id: string; threadId: string }>("gmail.send", writeInput, wctx);
    expect(out.id).toBeTruthy();
    return { id: out.id, to: writeInput.to };
  });

  await s.check(
    "verify",
    async () => {
      const v = await s.verifyAction("gmail.send", writeInput, wctx!);
      expect(v.happened).toBe(true);
      const msg = await s.run<{ id: string; subject: string }>("gmail.get_message", { messageId: wrote!.id });
      expect(msg.subject).toBe(s.marker);
      return { id: wrote!.id, subject: msg.subject };
    },
    { skip: wrote ? undefined : "write did not complete" },
  );

  await s.check(
    "cleanup",
    async () => {
      // No adapter action deletes mail; delete the sent-to-self message via the Gmail API directly.
      await s.ctx().http.request({ method: "DELETE", path: `/gmail/v1/users/me/messages/${wrote!.id}` });
      const err = await expectKind(s.run("gmail.get_message", { messageId: wrote!.id }), "not_found");
      return { deleted: wrote!.id, confirmed: err.kind };
    },
    { skip: wrote ? undefined : "write did not complete" },
  );

  await s.check("errors", async () => {
    const err = await expectKind(s.run("gmail.get_message", { messageId: `missing-${missing()}` }), "not_found");
    return { kind: err.kind };
  });

  await revocation(s);
};

// ---------------------------------------------------------------- slack

const slack: Scenario = async (s) => {
  await connectAndIdentity(s);
  const t = s.target;
  const wctx = s.creds ? s.ctx() : undefined;

  await s.check("read", async () => {
    const out = await s.run<{ channels: { id: string; name: string }[] }>("slack.list_channels", {});
    expect(out.channels.length).toBeGreaterThan(0);
    return { channels: out.channels.length };
  });

  const text = `${s.marker} — Flowline live certification (safe to delete)`;
  const wrote = await s.check(
    "write",
    async () => {
      const out = await s.run<{ ts: string; channel: string }>("slack.post_message", { channel: t!.channel, text }, wctx);
      expect(out.ts).toBeTruthy();
      return { ts: out.ts, channel: out.channel };
    },
    { needsTarget: true },
  );

  await s.check(
    "verify",
    async () => {
      const v = await s.verifyAction<{ ts: string }>("slack.post_message", { channel: t!.channel, text }, wctx!);
      expect(v.happened).toBe(true);
      expect(v.output?.ts).toBe(wrote!.ts);
      const { data } = await s.ctx().http.request<{ messages?: { ts: string; text: string }[] }>({
        method: "GET",
        path: "/conversations.history",
        query: { channel: t!.channel, limit: 50 },
      });
      const found = (data.messages ?? []).find((m) => m.ts === wrote!.ts);
      expect(found?.text).toBe(text);
      return { ts: wrote!.ts };
    },
    { needsTarget: true, skip: wrote ? undefined : "write did not complete" },
  );

  await s.check(
    "cleanup",
    async () => {
      // No adapter action deletes messages; chat.delete via the Slack API directly.
      await s.ctx().http.request({ method: "POST", path: "/chat.delete", json: { channel: t!.channel, ts: wrote!.ts } });
      const { data } = await s.ctx().http.request<{ messages?: { ts: string }[] }>({
        method: "GET",
        path: "/conversations.history",
        query: { channel: t!.channel, limit: 50 },
      });
      expect((data.messages ?? []).some((m) => m.ts === wrote!.ts)).toBe(false);
      return { deletedTs: wrote!.ts };
    },
    { needsTarget: true, skip: wrote ? undefined : "write did not complete" },
  );

  await s.check("errors", async () => {
    const err = await expectKind(s.run("slack.post_message", { channel: `C0MISS${missing().toUpperCase().replace(/[^A-Z0-9]/g, "")}`, text: "x" }), "client");
    expect(err.message).toContain("channel_not_found");
    return { kind: err.kind };
  });

  await revocation(s);
};

// ---------------------------------------------------------------- hubspot

const hubspot: Scenario = async (s) => {
  await connectAndIdentity(s);
  const email = `${s.marker}@example.com`;

  // write runs before read here: upsert creates the marked test contact that read/verify then fetch.
  const wrote = await s.check("write", async () => {
    const out = await s.run<{ contacts: { id: string; email: string }[] }>("hubspot.upsert_contact", {
      email,
      properties: { firstname: "Flowline", lastname: "Certification" },
    });
    expect(out.contacts[0]?.id).toBeTruthy();
    return { id: out.contacts[0]!.id, email };
  });

  await s.check(
    "read",
    async () => {
      const out = await s.run<{ id: string; properties: Record<string, unknown> }>("hubspot.get_contact", { email });
      expect(out.id).toBeTruthy();
      return { id: out.id };
    },
    { skip: wrote ? undefined : "write did not complete" },
  );

  await s.check(
    "verify",
    async () => {
      const out = await s.run<{ id: string; properties: Record<string, unknown> }>("hubspot.get_contact", { email });
      expect(out.id).toBe(wrote!.id);
      expect(out.properties.email).toBe(email);
      expect(out.properties.firstname).toBe("Flowline");
      expect(out.properties.lastname).toBe("Certification");
      return { id: out.id };
    },
    { skip: wrote ? undefined : "write did not complete" },
  );

  await s.check(
    "cleanup",
    async () => {
      // No adapter action archives contacts; DELETE via the HubSpot API directly (archives it).
      await s.ctx().http.request({ method: "DELETE", path: `/crm/v3/objects/contacts/${wrote!.id}` });
      const err = await expectKind(s.run("hubspot.get_contact", { email }), "not_found");
      return { archived: wrote!.id, confirmed: err.kind };
    },
    { skip: wrote ? undefined : "write did not complete" },
  );

  await s.check("errors", async () => {
    const err = await expectKind(s.run("hubspot.get_contact", { email: `missing-${missing()}@example.com` }), "not_found");
    return { kind: err.kind };
  });

  await revocation(s);
};

// ---------------------------------------------------------------- zendesk

const zendesk: Scenario = async (s) => {
  await connectAndIdentity(s);
  const baseUrl = () => `https://${s.creds!.settings!.subdomain}.zendesk.com`;

  await s.check("read", async () => {
    const out = await s.run<{ tickets: { id: number }[] }>("zendesk.list_tickets", {});
    return { tickets: out.tickets.length };
  });

  const wrote = await s.check("write", async () => {
    // The adapter exposes no ticket creation; create via the Zendesk API through ctx.http.
    const { data } = await s.ctx().http.request<{ ticket: { id: number } }>({
      method: "POST",
      path: "/api/v2/tickets.json",
      baseUrl: baseUrl(),
      json: { ticket: { subject: s.marker, comment: { body: "Flowline live certification — safe to delete." }, tags: ["flowline-cert"], priority: "low" } },
    });
    expect(data.ticket.id).toBeGreaterThan(0);
    return { id: data.ticket.id };
  });

  await s.check(
    "verify",
    async () => {
      const { data } = await s.ctx().http.request<{ ticket: { id: number; subject: string; tags: string[] } }>({
        method: "GET",
        path: `/api/v2/tickets/${wrote!.id}.json`,
        baseUrl: baseUrl(),
      });
      expect(data.ticket.subject).toBe(s.marker);
      expect(data.ticket.tags).toContain("flowline-cert");
      return { id: data.ticket.id };
    },
    { skip: wrote ? undefined : "write did not complete" },
  );

  await s.check(
    "cleanup",
    async () => {
      await s.ctx().http.request({ method: "DELETE", path: `/api/v2/tickets/${wrote!.id}.json`, baseUrl: baseUrl() });
      const err = await expectKind(
        s.ctx().http.request({ method: "GET", path: `/api/v2/tickets/${wrote!.id}.json`, baseUrl: baseUrl() }),
        "not_found",
      );
      return { deleted: wrote!.id, confirmed: err.kind };
    },
    { skip: wrote ? undefined : "write did not complete" },
  );

  await s.check("errors", async () => {
    const err = await expectKind(s.run("zendesk.update_ticket", { ticketId: 999999999, tags: ["flowline-cert"] }), "not_found");
    return { kind: err.kind };
  });

  await revocation(s);
};

// ---------------------------------------------------------------- airtable

const airtable: Scenario = async (s) => {
  await connectAndIdentity(s);
  const t = s.target;
  const field = t?.field ?? "Name";

  await s.check(
    "read",
    async () => {
      const out = await s.run<{ records: { id: string }[] }>("airtable.list_records", { baseId: t!.baseId, table: t!.table });
      return { records: out.records.length };
    },
    { needsTarget: true },
  );

  const wrote = await s.check(
    "write",
    async () => {
      const out = await s.run<{ id: string }>("airtable.create_record", { baseId: t!.baseId, table: t!.table, fields: { [field]: s.marker } });
      expect(out.id).toBeTruthy();
      return { id: out.id };
    },
    { needsTarget: true },
  );

  await s.check(
    "verify",
    async () => {
      const out = await s.run<{ records: { id: string; fields: Record<string, unknown> }[] }>("airtable.list_records", { baseId: t!.baseId, table: t!.table });
      const rec = out.records.find((r) => r.id === wrote!.id);
      expect(rec, "created record is listed").toBeTruthy();
      expect(rec!.fields[field]).toBe(s.marker);
      return { id: rec!.id };
    },
    { needsTarget: true, skip: wrote ? undefined : "write did not complete" },
  );

  await s.check(
    "cleanup",
    async () => {
      // No adapter action deletes records; DELETE via the Airtable API directly.
      await s.ctx().http.request({ method: "DELETE", path: `/v0/${t!.baseId}/${encodeURIComponent(t!.table)}/${wrote!.id}` });
      const out = await s.run<{ records: { id: string }[] }>("airtable.list_records", { baseId: t!.baseId, table: t!.table });
      expect(out.records.some((r) => r.id === wrote!.id)).toBe(false);
      return { deleted: wrote!.id };
    },
    { needsTarget: true, skip: wrote ? undefined : "write did not complete" },
  );

  await s.check("errors", async () => {
    const err = await expectKind(
      s.ctx().http.request({ method: "DELETE", path: `/v0/${t?.baseId ?? "appMissing"}/${encodeURIComponent(t?.table ?? "Missing")}/recMissing${missing()}` }),
      "not_found",
    );
    return { kind: err.kind };
  });

  await revocation(s);
};

// ---------------------------------------------------------------- snowflake (read-only)

const snowflake: Scenario = async (s) => {
  await connectAndIdentity(s);

  await s.check("read", async () => {
    const out = await s.run<{ columns: string[]; rowCount: number }>("snowflake.query", { statement: "SELECT CURRENT_USER(), CURRENT_ACCOUNT()" });
    expect(out.rowCount).toBeGreaterThan(0);
    return { columns: out.columns };
  });

  await s.check("write", async () => {}, { na: "Snowflake adapter is read-only by design (snowflake.query refuses writes)" });
  await s.check("verify", async () => {}, { na: "Nothing is written, so there is nothing to read back" });
  await s.check("cleanup", async () => {}, { na: "Nothing is written, so there is nothing to clean up" });

  await s.check("errors", async () => {
    const err = await expectKind(s.run("snowflake.query", { statement: "DROP TABLE invoices" }), "client");
    expect(err.message).toMatch(/read-only/i);
    return { kind: err.kind };
  });

  await revocation(s);
};

// ---------------------------------------------------------------- github

const GH_HEADERS = { accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };

const github: Scenario = async (s) => {
  await connectAndIdentity(s);
  const t = s.target;
  const wctx = s.creds ? s.ctx() : undefined;

  await s.check(
    "read",
    async () => {
      if (t!.pr) {
        const out = await s.run<{ number: number; title: string }>("github.get_pull_request", { owner: t!.owner, repo: t!.repo, number: Number(t!.pr) });
        expect(out.number).toBe(Number(t!.pr));
        return { pr: out.number, title: out.title };
      }
      // No adapter action reads an issue; list its comments via the GitHub API directly.
      const { data } = await s.ctx().http.request<unknown[]>({
        method: "GET",
        path: `/repos/${t!.owner}/${t!.repo}/issues/${t!.issue}/comments`,
        headers: GH_HEADERS,
      });
      return { comments: data.length };
    },
    { needsTarget: true },
  );

  const wrote = await s.check(
    "write",
    async () => {
      const out = await s.run<{ id: number; url: string }>(
        "github.create_issue_comment",
        { owner: t!.owner, repo: t!.repo, number: Number(t!.issue), body: `Flowline live certification ${s.marker} (safe to delete)` },
        wctx,
      );
      expect(out.id).toBeGreaterThan(0);
      return { id: out.id, url: out.url };
    },
    { needsTarget: true },
  );

  await s.check(
    "verify",
    async () => {
      const v = await s.verifyAction<{ id: number }>("github.create_issue_comment", { owner: t!.owner, repo: t!.repo, number: Number(t!.issue), body: "x" }, wctx!);
      expect(v.happened).toBe(true);
      expect(v.output?.id).toBe(wrote!.id);
      return { id: wrote!.id };
    },
    { needsTarget: true, skip: wrote ? undefined : "write did not complete" },
  );

  await s.check(
    "cleanup",
    async () => {
      // No adapter action deletes comments; DELETE via the GitHub API directly.
      await s.ctx().http.request({ method: "DELETE", path: `/repos/${t!.owner}/${t!.repo}/issues/comments/${wrote!.id}`, headers: GH_HEADERS });
      const { data } = await s.ctx().http.request<{ id: number }[]>({
        method: "GET",
        path: `/repos/${t!.owner}/${t!.repo}/issues/${t!.issue}/comments`,
        query: { per_page: 100 },
        headers: GH_HEADERS,
      });
      expect(data.some((c) => c.id === wrote!.id)).toBe(false);
      return { deleted: wrote!.id };
    },
    { needsTarget: true, skip: wrote ? undefined : "write did not complete" },
  );

  await s.check("errors", async () => {
    const err = await expectKind(s.run("github.get_pull_request", { owner: t?.owner ?? "flowline-cert", repo: t?.repo ?? "missing", number: 999999999 }), "not_found");
    return { kind: err.kind };
  });

  await revocation(s);
};

// ---------------------------------------------------------------- stripe (test mode only)

const FORM = { "content-type": "application/x-www-form-urlencoded" };

const stripe: Scenario = async (s) => {
  await connectAndIdentity(s);
  const email = `${s.marker}@example.com`;

  await s.check("read", async () => {
    const out = await s.run<{ charges: { id: string }[] }>("stripe.list_charges", { limit: 5 });
    return { charges: out.charges.length };
  });

  const wrote = await s.check("write", async () => {
    // The adapter exposes no customer creation; create a TEST-mode customer via ctx.http.
    const { data } = await s.ctx().http.request<{ id: string }>({
      method: "POST",
      path: "/v1/customers",
      headers: FORM,
      body: new URLSearchParams({ email, name: "Flowline Certification", "metadata[flowline_cert]": s.marker }).toString(),
    });
    expect(data.id).toMatch(/^cus_/);
    return { id: data.id };
  });

  await s.check(
    "verify",
    async () => {
      const { data } = await s.ctx().http.request<{ id: string; email?: string; metadata?: Record<string, string> }>({
        method: "GET",
        path: `/v1/customers/${wrote!.id}`,
      });
      expect(data.email).toBe(email);
      expect(data.metadata?.flowline_cert).toBe(s.marker);
      return { id: data.id };
    },
    { skip: wrote ? undefined : "write did not complete" },
  );

  await s.check(
    "cleanup",
    async () => {
      await s.ctx().http.request({ method: "DELETE", path: `/v1/customers/${wrote!.id}` });
      const err = await expectKind(s.ctx().http.request({ method: "GET", path: `/v1/customers/${wrote!.id}` }), "not_found");
      return { deleted: wrote!.id, confirmed: err.kind };
    },
    { skip: wrote ? undefined : "write did not complete" },
  );

  await s.check("errors", async () => {
    const err = await expectKind(s.ctx().http.request({ method: "GET", path: `/v1/charges/ch_missing_${missing()}` }), "not_found");
    return { kind: err.kind };
  });

  const revokedOk = s.revoked?.token?.startsWith("sk_test_");
  await s.check(
    "revocation",
    async () => {
      const err = await expectKind(s.provider.identity(s.ctx(s.revoked!)), "auth");
      return { kind: err.kind };
    },
    { skip: s.revoked ? (revokedOk ? undefined : `revoked credential must also be an sk_test_ key (${s.envBase}_REVOKED)`) : `missing revoked credential (${s.envBase}_REVOKED)` },
  );
};

// ---------------------------------------------------------------- notion

const NOTION_HEADERS = { "Notion-Version": "2022-06-28" };

const notion: Scenario = async (s) => {
  await connectAndIdentity(s);
  const t = s.target;

  await s.check(
    "read",
    async () => {
      if (t!.databaseId) {
        const out = await s.run<{ results: { id: string }[] }>("notion.query_database", { databaseId: t!.databaseId, pageSize: 5 });
        return { results: out.results.length };
      }
      // No adapter action lists a page's children; read them via the Notion API directly.
      const { data } = await s.ctx().http.request<{ results: unknown[] }>({
        method: "GET",
        path: `/v1/blocks/${t!.parentPageId}/children`,
        headers: NOTION_HEADERS,
      });
      return { children: data.results.length };
    },
    { needsTarget: true },
  );

  const wrote = await s.check(
    "write",
    async () => {
      const out = await s.run<{ id: string; url: string }>("notion.create_page", {
        parentPageId: t!.parentPageId,
        properties: { title: { title: [{ text: { content: s.marker } }] } },
      });
      expect(out.id).toBeTruthy();
      return { id: out.id, url: out.url };
    },
    { needsTarget: true },
  );

  await s.check(
    "verify",
    async () => {
      const { data } = await s.ctx().http.request<{ id: string; properties: Record<string, { title?: { text?: { content?: string }; plain_text?: string }[] }> }>({
        method: "GET",
        path: `/v1/pages/${wrote!.id}`,
        headers: NOTION_HEADERS,
      });
      const title = data.properties.title?.title?.[0];
      expect(title?.text?.content ?? title?.plain_text).toBe(s.marker);
      return { id: data.id };
    },
    { needsTarget: true, skip: wrote ? undefined : "write did not complete" },
  );

  await s.check(
    "cleanup",
    async () => {
      // Notion deletes by archiving; no adapter action for it, so PATCH via the API directly.
      await s.ctx().http.request({ method: "PATCH", path: `/v1/pages/${wrote!.id}`, headers: NOTION_HEADERS, json: { archived: true } });
      const { data } = await s.ctx().http.request<{ archived?: boolean }>({ method: "GET", path: `/v1/pages/${wrote!.id}`, headers: NOTION_HEADERS });
      expect(data.archived).toBe(true);
      return { archived: wrote!.id };
    },
    { needsTarget: true, skip: wrote ? undefined : "write did not complete" },
  );

  await s.check("errors", async () => {
    const err = await expectKind(
      s.ctx().http.request({ method: "GET", path: "/v1/pages/00000000-0000-0000-0000-000000000000", headers: NOTION_HEADERS }),
      "not_found",
    );
    return { kind: err.kind };
  });

  await revocation(s);
};

// ---------------------------------------------------------------- linear

const linear: Scenario = async (s) => {
  await connectAndIdentity(s);
  const t = s.target;
  const wctx = s.creds ? s.ctx() : undefined;

  await s.check("read", async () => {
    const out = await s.run<{ teams: { id: string; key: string }[] }>("linear.list_teams", {});
    expect(out.teams.length).toBeGreaterThan(0);
    if (t?.teamId) expect(out.teams.some((team) => team.id === t.teamId), `target team ${t.teamId} exists`).toBe(true);
    return { teams: out.teams.map((team) => team.key) };
  });

  const wrote = await s.check(
    "write",
    async () => {
      const out = await s.run<{ id: string; identifier: string }>(
        "linear.create_issue",
        { teamId: t!.teamId, title: `${s.marker} — Flowline certification`, description: "Flowline live certification — safe to delete." },
        wctx,
      );
      expect(out.id).toBeTruthy();
      return { id: out.id, identifier: out.identifier };
    },
    { needsTarget: true },
  );

  await s.check(
    "verify",
    async () => {
      const v = await s.verifyAction<{ id: string }>("linear.create_issue", { teamId: t!.teamId, title: "x" }, wctx!);
      expect(v.happened).toBe(true);
      expect(v.output?.id).toBe(wrote!.id);
      return { id: wrote!.id };
    },
    { needsTarget: true, skip: wrote ? undefined : "write did not complete" },
  );

  await s.check(
    "cleanup",
    async () => {
      // No adapter action deletes issues; issueDelete via the GraphQL API through ctx.http.
      // Linear API keys are sent raw (no Bearer scheme), like the adapter does.
      const { data } = await s.ctx().http.request<{ data?: { issueDelete?: { success: boolean } }; errors?: { message: string }[] }>({
        method: "POST",
        path: "/graphql",
        headers: { authorization: s.creds!.token! },
        json: { query: "mutation DeleteIssue($id: String!) { issueDelete(id: $id) { success } }", variables: { id: wrote!.id } },
      });
      if (data.errors?.length) throw new ProviderError("client", data.errors[0]!.message);
      expect(data.data?.issueDelete?.success).toBe(true);
      const v = await s.verifyAction("linear.create_issue", { teamId: t!.teamId, title: "x" }, wctx!);
      expect(v.happened).toBe(false);
      return { deleted: wrote!.id };
    },
    { needsTarget: true, skip: wrote ? undefined : "write did not complete" },
  );

  await s.check("errors", async () => {
    const err = await expectKind(s.run("linear.create_issue", { teamId: `team-missing-${missing()}`, title: "x" }), "client");
    return { kind: err.kind };
  });

  await revocation(s);
};

// ---------------------------------------------------------------- registry

export const SCENARIOS: Record<Exclude<ProviderId, "postgres">, Scenario> = {
  google_sheets: googleSheets,
  gmail,
  slack,
  hubspot,
  zendesk,
  airtable,
  snowflake,
  github,
  stripe,
  notion,
  linear,
};
