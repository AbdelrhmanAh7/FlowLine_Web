import { expect, it } from "vitest";
import { createCliRequestKeys } from "@/components/company-builder/cli-request-keys";

it("keeps a retry key after an error, but completes the submitted text even if another request was edited in flight", () => {
  let sequence = 0;
  const keys = createCliRequestKeys(() => `request-${++sequence}`);
  const submitted = { cli: "codex", kind: "text_trial", text: "Original text" } as const;
  const edited = { ...submitted, text: "Later text" };
  const originalKey = keys.get(submitted);
  expect(keys.get(submitted)).toBe(originalKey);
  const editedKey = keys.get(edited);
  keys.complete(submitted);
  expect(keys.get(edited)).toBe(editedKey);
  expect(keys.get(submitted)).not.toBe(originalKey);
  expect(keys.get({ ...submitted, cli: "claude" })).not.toBe(keys.get(submitted));
});
