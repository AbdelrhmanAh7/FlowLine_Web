import { describe, expect, it, vi } from "vitest";

vi.mock("@/i18n/server", () => ({ getT: async () => (key: string) => key }));
vi.mock("@/server/platform-access", () => ({
  platformAdminOrNull: async () => ({ user: { id: "test", email: "test@test.com", name: "Test" }, session: { id: "test", tokenHash: "hash", createdAt: new Date() } }),
}));

const CopyPage = (await import("@/app/admin/copy/page")).default;
const { CopyEditor } = await import("@/app/admin/copy/copy-editor");

describe("/admin/copy page", () => {
  it("renders the CopyEditor client component so server errors are displayed client-side without breaking", async () => {
    const page = await CopyPage();
    expect(page.type).toBe(CopyEditor);
  });
});

