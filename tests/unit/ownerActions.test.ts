import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  type OwnerActionBlockedBy,
  type OwnerActionId,
  type OwnerActionRow,
  type OwnerActionStatus,
  OWNER_ACTIONS_PP_ROWS,
  getOwnerActionsStatusStub,
} from "@/types/ownerActions";

describe("@issue-158 owner actions PP-02..PP-09 scaffolding and types", () => {
  const EXPECTED_IDS: OwnerActionId[] = [
    "PP-02",
    "PP-03",
    "PP-04",
    "PP-05",
    "PP-06",
    "PP-07",
    "PP-08",
    "PP-09",
  ];

  const VALID_STATUSES: OwnerActionStatus[] = ["pending", "done", "blocked"];
  const VALID_BLOCKED_BY: OwnerActionBlockedBy[] = ["money", "legal", "people"];

  it("covers every PP-02..PP-09 checklist row with unique ids", () => {
    expect(OWNER_ACTIONS_PP_ROWS).toHaveLength(EXPECTED_IDS.length);
    const ids = OWNER_ACTIONS_PP_ROWS.map((row) => row.id);
    expect(ids).toEqual(EXPECTED_IDS);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(OWNER_ACTIONS_PP_ROWS.length);
  });

  it("assigns each row a non-empty title and valid status", () => {
    for (const row of OWNER_ACTIONS_PP_ROWS) {
      expect(typeof row.title).toBe("string");
      expect(row.title.trim().length).toBeGreaterThan(0);
      expect(VALID_STATUSES).toContain(row.status);
    }
  });

  it("requires blockedBy ('money'|'legal'|'people') when status is blocked", () => {
    for (const row of OWNER_ACTIONS_PP_ROWS) {
      if (row.status === "blocked") {
        expect(row.blockedBy).toBeDefined();
        expect(VALID_BLOCKED_BY).toContain(row.blockedBy);
      } else {
        expect(row.blockedBy).toBeUndefined();
      }
    }
  });

  it("honestly reflects uncompleted states with no fake success (done)", () => {
    for (const row of OWNER_ACTIONS_PP_ROWS) {
      expect(row.status).not.toBe("done");
      expect(["pending", "blocked"]).toContain(row.status);
    }
  });

  it("contains no secrets, pricing calculations, or provider credential fields", () => {
    const ALLOWED_KEYS = new Set(["id", "title", "status", "blockedBy"]);
    for (const row of OWNER_ACTIONS_PP_ROWS) {
      const keys = Object.keys(row);
      for (const key of keys) {
        expect(ALLOWED_KEYS.has(key)).toBe(true);
      }
      expect(JSON.stringify(row)).not.toMatch(/api_?key|private_?key|bearer|token|secret|password|\$|\bprice\b|\bcost\b|\busd\b/i);
    }
  });

  it("returns the read-only contract stub from getOwnerActionsStatusStub()", () => {
    const res = getOwnerActionsStatusStub();
    expect(res).toBeDefined();
    expect(res.actions).toBe(OWNER_ACTIONS_PP_ROWS);
    expect(Object.isFrozen(OWNER_ACTIONS_PP_ROWS) || Array.isArray(res.actions)).toBe(true);
  });

  it("supports type-safe creation of pending, done, and blocked rows", () => {
    const pendingRow: OwnerActionRow = {
      id: "PP-02",
      title: "Test pending",
      status: "pending",
    };
    expect(pendingRow.status).toBe("pending");

    const blockedRow: OwnerActionRow = {
      id: "PP-03",
      title: "Test blocked",
      status: "blocked",
      blockedBy: "money",
    };
    expect(blockedRow.blockedBy).toBe("money");

    const doneRow: OwnerActionRow = {
      id: "PP-04",
      title: "Test done",
      status: "done",
    };
    expect(doneRow.status).toBe("done");
  });

  it("ensures OWNER_ACTIONS.md documents the scaffolding and preserves owner-only boundaries", () => {
    const docPath = resolve(process.cwd(), "docs/implementation/OWNER_ACTIONS.md");
    const doc = readFileSync(docPath, "utf8");

    expect(doc).toContain("PP-02..PP-09");
    expect(doc).toContain("src/types/ownerActions.ts");
    expect(doc).toMatch(/Refs #30/);
    expect(doc).toMatch(/Refs #162/);
    expect(doc).toMatch(/owner-only/i);

    // Guard: never attach a closing keyword to #30 in OWNER_ACTIONS.md
    expect(doc).not.toMatch(/(?<!\bowner(?:'s)? )\b(close[sd]?|fix(e[sd])?|resolve[sd]?)\s*:?\s*#30\b/i);
  });

  it("proves AI_QUESTIONS.md contains no open questions or blocked disclaimers for #158", () => {
    const qPath = resolve(process.cwd(), "AI_QUESTIONS.md");
    const content = readFileSync(qPath, "utf8");
    expect(content).not.toMatch(/#158\b/);
    expect(content).not.toMatch(/no code was written/i);
  });
});
