import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ rows: [] as unknown[], fail: null as unknown }));
vi.mock("@/db", () => ({
  schema: { platformSetting: { key: "key" } },
  db: {
    select: () => ({
      from: () => ({
        where: async () => {
          if (state.fail) throw state.fail;
          return state.rows;
        },
      }),
    }),
  },
}));

import { getCopyEditorState } from "@/server/platform-copy";
import { HttpError } from "@/server/http";

afterEach(() => {
  state.fail = null;
  state.rows = [];
  vi.restoreAllMocks();
});

describe("getCopyEditorState", () => {
  it("returns base copy without undefined entries and empty overrides", async () => {
    const out = await getCopyEditorState();
    for (const locale of ["ar", "en"] as const) {
      expect(Object.values(out.base[locale]).every((v) => typeof v === "string")).toBe(true);
    }
    expect(out.draft).toMatchObject({ value: { ar: {}, en: {} }, revision: 0 });
    expect(out.published.revision).toBe(0);
  });

  it("maps a store failure to a 503 and logs only the error type", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    state.fail = new TypeError("password=hunter2 connection refused");
    const err = await getCopyEditorState().catch((e) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect(err).toMatchObject({ status: 503, code: "COPY_STATE_UNAVAILABLE" });
    expect(JSON.stringify(log.mock.calls)).toContain("TypeError");
    expect(JSON.stringify(log.mock.calls)).not.toContain("hunter2");
    expect(err.message).not.toContain("hunter2");
  });

  it("does not wrap an HttpError twice", async () => {
    state.fail = new HttpError(409, "X", "x");
    await expect(getCopyEditorState()).rejects.toMatchObject({ status: 409, code: "X" });
  });
});
