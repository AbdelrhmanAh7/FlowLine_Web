import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const deps = vi.hoisted(() => ({
  requireUser: vi.fn(),
  requireWorkspace: vi.fn(),
  insert: vi.fn(),
  insertRetainedFile: vi.fn(),
  addSource: vi.fn(),
}));
// Since #18 the files route stores uploads through insertRetainedFile inside db.transaction.
vi.mock("@/db", () => ({ db: { insert: deps.insert, select: vi.fn(), transaction: async (fn: (tx: unknown) => unknown) => fn({}) }, schema: { fileObject: {} } }));
vi.mock("@/server/retained-files", () => ({ insertRetainedFile: deps.insertRetainedFile }));
vi.mock("@/server/access", () => ({ requireUser: deps.requireUser, requireWorkspace: deps.requireWorkspace }));
vi.mock("@/server/knowledge", () => ({ KNOWLEDGE_MAX_BYTES: 5 * 1024 * 1024, addSource: deps.addSource, listSources: vi.fn() }));

import { POST as files } from "@/app/api/workspaces/[wid]/files/route";
import { POST as knowledge } from "@/app/api/workspaces/[wid]/knowledge/route";
import { BODY_READ_TIMEOUT_MS, notFound, UPLOAD_BODY_READ_TIMEOUT_MS, unauthorized } from "@/server/http";

const ctx = { params: Promise.resolve({ wid: "workspace" }) };
const routes = [
  ["files", files, "flow.edit"],
  ["knowledge", knowledge, "knowledge.manage"],
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  deps.requireUser.mockResolvedValue({ id: "user" });
  deps.requireWorkspace.mockResolvedValue({ workspace: { id: "workspace" } });
  deps.insert.mockReturnValue({ values: () => ({ returning: async () => [{ id: "file", name: "a.txt", mime: "text/plain", size: 5 }] }) });
  deps.insertRetainedFile.mockResolvedValue({ id: "file", name: "a.txt", mime: "text/plain", size: 5 });
  deps.addSource.mockResolvedValue({ id: "source" });
});
afterEach(() => vi.useRealTimers());

function upload(body: ReadableStream<Uint8Array>, headers: Record<string, string> = {}) {
  return new Request("https://flowline.example/api/workspaces/workspace/upload", { method: "POST", headers, body, duplex: "half" } as RequestInit);
}

function expectNoDownstreamWork() {
  expect(deps.insert).not.toHaveBeenCalled();
  expect(deps.insertRetainedFile).not.toHaveBeenCalled();
  expect(deps.addSource).not.toHaveBeenCalled();
}

describe.each(routes)("%s upload route deadline", (_name, invoke, capability) => {
  it("keeps reading a stalled upload past the 10 s default and refuses it at the 90 s upload deadline", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    let outcome: Response | undefined;
    const response = invoke(upload(new ReadableStream<Uint8Array>({ pull: () => new Promise(() => {}), cancel })), ctx);
    void response.then((value) => { outcome = value; });
    await vi.advanceTimersByTimeAsync(BODY_READ_TIMEOUT_MS + 1);
    expect(outcome).toBeUndefined();
    await vi.advanceTimersByTimeAsync(UPLOAD_BODY_READ_TIMEOUT_MS - BODY_READ_TIMEOUT_MS - 2);
    expect(outcome).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    const result = await response;
    expect(result.status).toBe(408);
    expect((await result.json()).error.code).toBe("BODY_READ_TIMEOUT");
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    expectNoDownstreamWork();
  });

  it("accepts a multipart upload whose bytes arrive over 60 s", async () => {
    vi.useFakeTimers();
    const form = new FormData();
    form.set("file", new File(["hello"], "a.txt", { type: "text/plain" }));
    const encoded = new Response(form);
    const contentType = encoded.headers.get("content-type")!;
    const bytes = new Uint8Array(await encoded.arrayBuffer());
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const response = invoke(upload(new ReadableStream<Uint8Array>({ start(value) { controller = value; } }), { "content-type": contentType }), ctx);
    controller.enqueue(bytes.subarray(0, 10));
    await vi.advanceTimersByTimeAsync(60_000);
    controller.enqueue(bytes.subarray(10));
    controller.close();
    const result = await response;
    expect(result.status).toBe(201);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("authorizes the member before reading any body byte, so only they reach the long deadline", async () => {
    for (const refusal of [unauthorized(), notFound("Workspace not found")]) {
      deps.requireUser.mockReset().mockResolvedValue({ id: "user" });
      deps.requireWorkspace.mockReset();
      (refusal.status === 401 ? deps.requireUser : deps.requireWorkspace).mockRejectedValueOnce(refusal);
      const request = upload(new ReadableStream<Uint8Array>({ pull: () => new Promise<void>(() => {}) }));
      const result = await invoke(request, ctx);
      expect(result.status).toBe(refusal.status);
      // No reader was ever opened on the body, so no deadline timer was started either.
      expect(request.body!.locked).toBe(false);
      expect(request.bodyUsed).toBe(false);
      expectNoDownstreamWork();
    }
    expect(deps.requireWorkspace).toHaveBeenCalledTimes(1);
    expect(deps.requireWorkspace).toHaveBeenCalledWith({ id: "user" }, "workspace", capability);
  });
});
