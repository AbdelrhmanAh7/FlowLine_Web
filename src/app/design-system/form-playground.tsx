"use client";

import { useState } from "react";
import { Eye, Mail, RotateCcw, UserRound } from "lucide-react";
import { Button, DynamicForm, type DynamicFormField } from "@/components/ui";
import { useT } from "@/i18n/client";

type Values = { name: string; email: string; mode: string; includeNotes: boolean; notes: string };

/** A real schema renderer; its output is explicitly a local preview, never a saved result. */
export function FormPlayground() {
  const t = useT();
  const [values, setValues] = useState<Values>({ name: "", email: "", mode: "a", includeNotes: false, notes: "" });
  const [preview, setPreview] = useState<Values | null>(null);
  const fields: DynamicFormField<Values>[] = [
    { name: "name", id: "schema-name", type: "text", label: t("designGuide.name"), required: true, autoComplete: "name", startIcon: <UserRound className="size-4" />, messages: { required: t("forms.required") } },
    { name: "email", id: "schema-email", type: "email", label: t("account.email"), dir: "ltr", autoComplete: "email", required: true, startIcon: <Mail className="size-4" />, messages: { required: t("forms.required"), invalid: t("forms.emailInvalid") } },
    { name: "mode", id: "schema-mode", type: "select", label: t("designGuide.pickOne"), options: [{ value: "a", label: t("designGuide.optionA") }, { value: "b", label: t("designGuide.optionB") }] },
    { name: "includeNotes", id: "schema-include-notes", type: "checkbox", label: t("designGuide.formShowNotes") },
  ];
  if (values.includeNotes) fields.push({ name: "notes", id: "schema-notes", type: "textarea", label: t("designGuide.formNotes"), rows: 3 });
  return <section aria-labelledby="schema-form-heading" className="rounded-xl border border-line bg-card p-5" data-testid="schema-form-demo">
    <h2 id="schema-form-heading" className="text-xl font-semibold">{t("designGuide.formSchemaTitle")}</h2>
    <p className="mt-2 text-med">{t("designGuide.formSchemaBody")}</p>
    <p className="mt-2 text-sm text-muted">{t("designGuide.formPreviewNote")}</p>
    <div className="mt-5 grid items-start gap-5 lg:grid-cols-2">
      <DynamicForm fields={fields} values={values} onValuesChange={setValues} onSubmit={(next) => setPreview({ ...next, notes: next.includeNotes ? next.notes : "" })} submitLabel={t("designGuide.formPreview")} submitErrorMessage={t("account.states.failed")} submitIcon={<Eye className="size-4" />} />
      <div className="space-y-3">
        <h3 className="font-medium">{t("designGuide.formValuePreview")}</h3>
        {preview && <pre dir="ltr" className="data max-h-64 overflow-auto rounded-lg border border-line bg-surface p-3" data-testid="schema-form-values">{JSON.stringify(preview, null, 2)}</pre>}
        <Button onClick={() => setPreview(null)} disabled={!preview} startIcon={<RotateCcw className="size-4" />}>{t("designGuide.formReset")}</Button>
      </div>
    </div>
  </section>;
}
