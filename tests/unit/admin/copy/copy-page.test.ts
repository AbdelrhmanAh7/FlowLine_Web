import { beforeEach, describe, expect, it, vi } from "vitest";

const adminCtx = { user: { id: "test", email: "test@test.com", name: "Test" }, session: { id: "test", tokenHash: "hash", createdAt: new Date() } };
const { platformAdminOrNull } = vi.hoisted(() => ({
  platformAdminOrNull: vi.fn(),
}));

vi.mock("@/i18n/server", () => ({ getT: async () => (key: string) => key }));
vi.mock("@/server/platform-access", () => ({
  platformAdminOrNull,
}));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    const err = new Error("NEXT_NOT_FOUND");
    (err as unknown as { digest: string }).digest = "NEXT_NOT_FOUND";
    throw err;
  }),
}));

const CopyPage = (await import("@/app/admin/copy/page")).default;
const { CopyEditor } = await import("@/app/admin/copy/copy-editor");
const { notFound } = await import("next/navigation");

describe("/admin/copy page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the CopyEditor client component for an authorized platform admin", async () => {
    platformAdminOrNull.mockResolvedValueOnce(adminCtx);
    const page = await CopyPage();
    expect(page.type).toBe(CopyEditor);
    expect(notFound).not.toHaveBeenCalled();
  });

  it("calls notFound() and hides the panel when not a platform admin", async () => {
    platformAdminOrNull.mockResolvedValueOnce(null);
    await expect(CopyPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalledTimes(1);
  });
});
