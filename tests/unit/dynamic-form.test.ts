import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizeDynamicNumberDraft, validateDynamicForm, type DynamicFormField } from "@/components/ui/dynamic-form";

type Values = { email: string; password: string; seats: number | string; enabled: boolean };

const fields: DynamicFormField<Values>[] = [
  { name: "email", type: "email", label: "Email", required: true, messages: { required: "Enter an email", invalid: "Enter a valid email" } },
  { name: "password", type: "password", label: "Password", required: true, messages: { required: "Enter a password", minLength: { value: 8, message: "Use 8 characters" } } },
  { name: "seats", type: "number", label: "Seats", messages: { invalid: "Enter a number", min: { value: 1, message: "Choose at least one" } } },
  { name: "enabled", type: "checkbox", label: "Enabled", required: true, messages: { required: "Enable this option" } },
];

describe("dynamic form validation", () => {
  it("uses POST so pre-hydration credentials are never serialized into a query string", () => {
    const source = readFileSync("src/components/ui/dynamic-form.tsx", "utf8");
    expect(source).toMatch(/<form\b[^>]*\bmethod="post"/);
  });

  it("returns translated messages for required, format, length, range, and checkbox rules", () => {
    expect(validateDynamicForm(fields, { email: "bad", password: "short", seats: 0, enabled: false })).toEqual({
      email: "Enter a valid email",
      password: "Use 8 characters",
      seats: "Choose at least one",
      enabled: "Enable this option",
    });
  });

  it("accepts a valid controlled value set and does not mutate the values", () => {
    const values = { email: "person@example.com", password: "long-enough", seats: 2, enabled: true };
    expect(validateDynamicForm(fields, values)).toEqual({});
    expect(values).toEqual({ email: "person@example.com", password: "long-enough", seats: 2, enabled: true });
  });

  it("fails closed with the localized field label when required or format copy is omitted", () => {
    const fieldsWithoutMessages: DynamicFormField<Values>[] = [
      { name: "email", type: "email", label: "Email address", required: true },
      { name: "password", type: "password", label: "Password", required: true },
      { name: "seats", type: "number", label: "Seats" },
    ];
    expect(validateDynamicForm(fieldsWithoutMessages, { email: "bad", password: "", seats: Number.NaN, enabled: false })).toEqual({
      email: "Email address",
      password: "Password",
      seats: "Seats",
    });
  });

  it("checks select membership and treats pattern schemas as full-string matches", () => {
    type ChoiceValues = { region: string; code: string };
    const choiceFields: DynamicFormField<ChoiceValues>[] = [
      { name: "region", type: "select", label: "Region", options: [{ value: "eu", label: "Europe" }, { value: "us", label: "United States" }], messages: { invalid: "Choose a listed region" } },
      { name: "code", type: "text", label: "Code", messages: { pattern: { value: "[A-Z]{2}", message: "Use two capitals" } } },
    ];
    expect(validateDynamicForm(choiceFields, { region: "admin", code: "AB-extra" })).toEqual({ region: "Choose a listed region", code: "Use two capitals" });
    expect(validateDynamicForm(choiceFields, { region: "eu", code: "AB" })).toEqual({});
  });

  it("keeps intermediate number drafts intact until they can be normalized", () => {
    expect(normalizeDynamicNumberDraft("1.")).toBe(1);
    expect(normalizeDynamicNumberDraft("-")).toBe("-");
    expect(normalizeDynamicNumberDraft("")).toBe("");
    expect(validateDynamicForm(fields, { email: "person@example.com", password: "long-enough", seats: "-", enabled: true })).toEqual({ seats: "Enter a number" });
  });

  it("ignores disabled fields and allows an empty schema for confirmation-only forms", () => {
    const disabled: DynamicFormField<Values>[] = [{ name: "email", type: "email", label: "Email", disabled: true, required: true }];
    expect(validateDynamicForm(disabled, { email: "", password: "", seats: "", enabled: false })).toEqual({});
    expect(validateDynamicForm([], { email: "", password: "", seats: "", enabled: false })).toEqual({});
  });
});
