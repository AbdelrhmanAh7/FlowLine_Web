# Shared developer forms

`DynamicForm` renders a developer-defined schema using the same `Input`, `Textarea`, `Select`, `Checkbox`, `Field` and `Button` used elsewhere. It is a reusable renderer, not a customer drag-and-drop editor. Try the conditional form and local preview at `/design-system` in development/test.

## One change across callers

- `src/components/ui/fields.tsx`: shared control styles, icons, labels, hints and error presentation. `INPUT_CLASS_NAME` also supplies the base styling for provider `SecretInput`.
- `src/components/ui/button.tsx`: shared variants, loading, disabled reasons and decorative start/end icons.
- `src/components/ui/dynamic-form.tsx`: schema rendering and validation.
- `src/design/tokens.ts`: semantic colors and other generated tokens; run `pnpm tokens`. See [CUSTOMIZE.md](CUSTOMIZE.md).

Use these exports from `@/components/ui`; avoid new native visible controls that duplicate their styling. Native file pickers and protected uncontrolled secret inputs retain their specialized behavior. A caller's explicit class override can intentionally alter appearance.

## Controlled schema example

This client component previews values locally. Replace the callback with the feature's actual authorized API operation and check its response before reporting success.

```tsx
"use client";
import { useState } from "react";
import { DynamicForm, type DynamicFormField } from "@/components/ui";
import { useT } from "@/i18n/client";

type Values = { email: string };
export function EmailPreview() {
  const t = useT();
  const [values, setValues] = useState<Values>({ email: "" });
  const [preview, setPreview] = useState<Values | null>(null);
  const fields: DynamicFormField<Values>[] = [{
    name: "email", type: "email", label: t("account.email"),
    dir: "ltr", autoComplete: "email", required: true,
    messages: {
      required: t("forms.required"),
      invalid: t("forms.emailInvalid"),
    },
  }];
  return <>
    <DynamicForm fields={fields} values={values}
      onValuesChange={setValues} onSubmit={next => setPreview({ ...next })}
      submitLabel={t("designGuide.formPreview")}
      submitErrorMessage={t("account.states.failed")} />
    {preview && <pre dir="ltr">{JSON.stringify(preview)}</pre>}
  </>;
}
```

## Schema and behavior

Supported field types: `text`, `email`, `password`, `number`, `textarea`, `select`, `checkbox`. Fields need a stable unique `name` from the values object and a translated `label`; optional `id`, `hint`, `placeholder`, `autoComplete`, `dir`, `disabled`, `required` configure presentation. Text/number fields accept `startIcon` and `endIcon`; textarea accepts `rows`; select accepts translated `{ value, label }` options.

`messages` supplies localized `required`/`invalid` errors and `{ value, message }` rules for `min`, `max`, `minLength`, `maxLength`, `pattern`. Required checkboxes must be checked. Empty optional values are allowed; disabled fields are not validated. Numeric bounds apply to number fields. String length uses JavaScript string length, not grapheme count. Patterns match the whole value; invalid patterns fail validation. Select values must match an offered option.

`validateDynamicForm(fields, values)` returns errors by field name. Feedback appears after blur or submit; the first invalid field receives focus. Missing required/format messages fall back to the supplied translated label; prefer explicit helpful messages. Labels, hints and errors are linked to controls through `id`/`htmlFor` and `aria-describedby`.

The parent owns values. Build the `fields` array conditionally for dependent fields; see `src/app/design-system/form-playground.tsx`. Hidden fields are not validated, but their values can remain in parent state: explicitly omit or clear them in the submitted payload when appropriate. Keep schemas developer-defined rather than accepting untrusted executable patterns.

The form uses POST, never native GET, before hydration. Submission prevents default after hydration, validates, blocks while busy, awaits `onSubmit`, and shows `submitErrorMessage` if it throws. `pending`, `submitDisabled`, `submitDisabledReason`, `submitIcon` and `children` support existing workflows. Display genuine backend errors/success through caller state; fetch does not throw on HTTP error status automatically.

An empty schema supports confirmation-only actions. Client validation never replaces backend checks, permissions, rate limits or CSRF guards. There is no nested-array renderer, asynchronous field-validation API or custom field registry; compose specialized existing controls for those cases.

## Credentials

Provider/API/SSO secrets must use `SecretInput` from `@/components/secret-input` and `takeSecret(ref.current)` at submit time. Keep secrets out of schema values, saved drafts, cache and evidence. Read [CREDENTIALS_DESIGN.md](../security/CREDENTIALS_DESIGN.md). Account login/reset password handling is an existing dedicated exception; preserve its security behavior.

## Verification

Unit validation coverage: `tests/unit/dynamic-form.test.ts`. Browser validation, conditional fields and local preview coverage: `e2e/dynamic-form.spec.ts`. Existing account-flow suites cover recovery callbacks. Review AR/EN, RTL/LTR machine fields, keyboard focus, errors, pending/disabled behavior and narrow layouts. Run the project gates described in [DEVELOPER_GUIDE.md](../DEVELOPER_GUIDE.md).

Number fields use a text control with decimal input mode to preserve intermediate typing such as '-' or '1.'. Declare their controlled value as 'number | string': onValuesChange can receive a raw string while editing, and valid submission normalizes it to a finite number. Invalid raw input remains editable and blocks submission.
