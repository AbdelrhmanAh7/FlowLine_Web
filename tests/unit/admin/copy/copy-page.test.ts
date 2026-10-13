import { describe, expect, it, vi } from "vitest";

// The page (a server component) only gates on the platform-admin check: an admin gets the editor element, everyone else
// gets notFound(). The client editor's own error display is covered in copy-editor.test.ts.
const access = vi.hoisted(() => ({ admin: null as unknown }));
const notFound = vi.hoisted(() => vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }));
vi.mock("next/navigation", () => ({ notFound }));
vi.mock("@/server/platform-access", () => ({ platformAdminOrNull: async () => access.admin }));
vi.mock("@/i18n/server", () => ({ getT: async () => (key: string) => key }));

const CopyPage = (await import("@/app/admin/copy/page")).default;
const { CopyEditor } = await import("@/app/admin/copy/copy-editor");

describe("/admin/copy page access", () => {
  it("serves the copy editor to a platform admin (the panel is loadable)", async () => {
    access.admin = { user: { id: "u", email: "a@b.c", name: "A" }, session: { id: "s", tokenHash: "h", createdAt: new Date() } };
    // React.createElement stores the component in `.type`; the editor is a function component, not a 404.
    expect((await CopyPage()).type).toBe(CopyEditor);
    expect(notFound).not.toHaveBeenCalled();
  });

  it("hides the panel from everyone who is not an active admin, with notFound() (the 404 the verifier sees is by design)", async () => {
    access.admin = null;
    await expect(CopyPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalledTimes(1);
  });
});
