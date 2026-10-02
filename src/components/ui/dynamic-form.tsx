"use client";

import { useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "./button";
import { Checkbox, Field, Input, Select, Textarea } from "./fields";
import { cn } from "./cn";

export type DynamicFormValue = string | number | boolean | "";
export type DynamicFormValues = Record<string, DynamicFormValue>;

type ValidationMessages = {
  required?: string;
  invalid?: string;
  min?: { value: number; message: string };
  max?: { value: number; message: string };
  minLength?: { value: number; message: string };
  maxLength?: { value: number; message: string };
  pattern?: { value: string; message: string };
};

type FieldBase<T extends DynamicFormValues> = {
  name: keyof T & string;
  id?: string;
  label: string;
  hint?: string;
  placeholder?: string;
  autoComplete?: string;
  dir?: "ltr" | "rtl" | "auto";
  disabled?: boolean;
  required?: boolean;
  messages?: ValidationMessages;
};

export type DynamicFormField<T extends DynamicFormValues = DynamicFormValues> =
  | (FieldBase<T> & { type: "text" | "email" | "password"; startIcon?: ReactNode; endIcon?: ReactNode })
  | (FieldBase<T> & { type: "number"; startIcon?: ReactNode; endIcon?: ReactNode })
  | (FieldBase<T> & { type: "textarea"; rows?: number })
  | (FieldBase<T> & { type: "select"; options: ReadonlyArray<{ value: string; label: string }> })
  | (FieldBase<T> & { type: "checkbox" });

/** Runs the same schema rules on blur and submit. Error copy comes from each field's translated schema messages. */
export function validateDynamicForm<T extends DynamicFormValues>(fields: ReadonlyArray<DynamicFormField<T>>, values: T): Partial<Record<keyof T, string>> {
  const errors: Partial<Record<keyof T, string>> = {};
  for (const field of fields) {
    if (field.disabled) continue;
    const value = values[field.name];
    const text = typeof value === "string" ? value : String(value ?? "");
    const empty = field.type === "checkbox" ? value !== true : text.trim() === "";
    const rules = field.messages;
    if (field.required && empty) {
      errors[field.name] = rules?.required ?? field.label;
      continue;
    }
    if (empty) continue;
    if (field.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
      errors[field.name] = rules?.invalid ?? field.label;
      continue;
    }
    if (field.type === "select" && !field.options.some((option) => option.value === text)) {
      errors[field.name] = rules?.invalid ?? field.label;
      continue;
    }
    if (field.type === "number" && (typeof value !== "number" || !Number.isFinite(value))) {
      errors[field.name] = rules?.invalid ?? field.label;
      continue;
    }
    if (typeof value === "number") {
      const min = field.type === "number" ? rules?.min : undefined;
      const max = field.type === "number" ? rules?.max : undefined;
      if (min && value < min.value) {
        errors[field.name] = min.message;
        continue;
      }
      if (max && value > max.value) {
        errors[field.name] = max.message;
        continue;
      }
    }
    if (rules?.minLength && text.length < rules.minLength.value) {
      errors[field.name] = rules.minLength.message;
      continue;
    }
    if (rules?.maxLength && text.length > rules.maxLength.value) {
      errors[field.name] = rules.maxLength.message;
      continue;
    }
    if (rules?.pattern) {
      try {
        if (!new RegExp(`^(?:${rules.pattern.value})$`, "u").test(text)) errors[field.name] = rules.pattern.message;
      } catch {
        errors[field.name] = rules.pattern.message;
      }
    }
  }
  return errors;
}

/** Keep incomplete number text intact while editing; convert only when the field blurs or submits. */
export function normalizeDynamicNumberDraft(raw: string): number | string {
  if (raw.trim() === "") return "";
  const value = Number(raw);
  return Number.isFinite(value) ? value : raw;
}

export function DynamicForm<T extends DynamicFormValues>({
  fields,
  values,
  onValuesChange,
  onSubmit,
  submitLabel,
  submitErrorMessage,
  submitIcon,
  pending = false,
  submitDisabled = false,
  submitDisabledReason,
  children,
  className,
}: {
  fields: ReadonlyArray<DynamicFormField<T>>;
  values: T;
  onValuesChange: (values: T) => void;
  onSubmit: (values: T) => void | Promise<void>;
  submitLabel: string;
  submitErrorMessage: string;
  submitIcon?: ReactNode;
  pending?: boolean;
  submitDisabled?: boolean;
  submitDisabledReason?: string;
  children?: ReactNode;
  className?: string;
}) {
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [touched, setTouched] = useState<Set<string>>(() => new Set());
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [numberDrafts, setNumberDrafts] = useState<Record<string, string>>({});
  const errors = validateDynamicForm(fields, values);

  function markTouched(name: string) {
    setTouched((current) => new Set(current).add(name));
  }

  function changeValue<K extends keyof T>(name: K, value: T[K]) {
    onValuesChange({ ...values, [name]: value });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitDisabled || submitDisabledReason || pending || busy) return;
    setSubmitted(true);
    setSubmitError(null);
    const submittedValues = { ...values };
    let normalized = false;
    for (const field of fields) {
      if (field.type !== "number") continue;
      const raw = numberDrafts[field.name] ?? String(values[field.name] ?? "");
      const value = normalizeDynamicNumberDraft(raw);
      if (submittedValues[field.name] !== value) normalized = true;
      submittedValues[field.name] = value as T[typeof field.name];
    }
    setNumberDrafts({});
    if (normalized) onValuesChange(submittedValues);
    const nextErrors = validateDynamicForm(fields, submittedValues);
    if (Object.keys(nextErrors).length) {
      const firstInvalid = fields.find((field) => Boolean(nextErrors[field.name]));
      const control = firstInvalid ? formRef.current?.elements.namedItem(firstInvalid.name) : null;
      if (control instanceof HTMLElement) control.focus();
      return;
    }
    setBusy(true);
    try {
      await onSubmit(submittedValues);
    } catch {
      setSubmitError(submitErrorMessage);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form ref={formRef} method="post" noValidate onSubmit={handleSubmit} aria-busy={busy || pending || undefined} className={cn("flex flex-col gap-4", className)}>
      {fields.map((field) => {
        const fieldId = field.id ?? `${id}-${field.name}`;
        const error = (submitted || touched.has(field.name)) ? errors[field.name] : undefined;
        const commitNumber = () => {
          const raw = numberDrafts[field.name] ?? String(values[field.name] ?? "");
          setNumberDrafts((current) => {
            if (!(field.name in current)) return current;
            const next = { ...current };
            delete next[field.name];
            return next;
          });
          const normalized = normalizeDynamicNumberDraft(raw) as T[typeof field.name];
          if (values[field.name] !== normalized) changeValue(field.name, normalized);
        };
        const common = { id: fieldId, name: field.name, disabled: field.disabled, required: field.required, dir: field.dir, onBlur: () => { if (field.type === "number") commitNumber(); markTouched(field.name); }, invalid: Boolean(error), "aria-invalid": Boolean(error) || undefined, "aria-describedby": (error || field.hint) ? `${fieldId}-desc` : undefined };
        let control: ReactNode;
        if (field.type === "textarea") {
          control = <Textarea {...common} placeholder={field.placeholder} minLength={field.messages?.minLength?.value} maxLength={field.messages?.maxLength?.value} rows={field.rows} value={String(values[field.name] ?? "")} onChange={(event) => changeValue(field.name, event.currentTarget.value as T[typeof field.name])} />;
        } else if (field.type === "select") {
          control = <Select {...common} value={String(values[field.name] ?? "")} onChange={(event) => changeValue(field.name, event.currentTarget.value as T[typeof field.name])}>
            <option value="">{field.placeholder ?? ""}</option>
            {field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </Select>;
        } else if (field.type === "checkbox") {
          control = <Checkbox {...common} checked={values[field.name] === true} onChange={(event) => changeValue(field.name, event.currentTarget.checked as T[typeof field.name])} />;
        } else {
          const type = field.type;
          const startIcon = "startIcon" in field ? field.startIcon : undefined;
          const endIcon = "endIcon" in field ? field.endIcon : undefined;
          control = <Input {...common} autoComplete={field.autoComplete} placeholder={field.placeholder} type={field.type === "number" ? "text" : type} inputMode={field.type === "number" ? "decimal" : undefined} min={field.type === "number" ? field.messages?.min?.value : undefined} max={field.type === "number" ? field.messages?.max?.value : undefined} minLength={field.type === "number" ? undefined : field.messages?.minLength?.value} maxLength={field.type === "number" ? undefined : field.messages?.maxLength?.value} pattern={field.type === "number" ? undefined : field.messages?.pattern?.value} value={field.type === "number" ? (numberDrafts[field.name] ?? String(values[field.name] ?? "")) : (values[field.name] === "" ? "" : String(values[field.name] ?? ""))} startIcon={startIcon} endIcon={endIcon} onChange={(event) => {
            const raw = event.currentTarget.value;
            if (field.type === "number") {
              setNumberDrafts((current) => ({ ...current, [field.name]: raw }));
            } else {
              changeValue(field.name, raw as T[typeof field.name]);
            }
          }} />;
        }
        return <Field key={field.name} label={field.label} htmlFor={fieldId} hint={field.hint} error={error}>{control}</Field>;
      })}
      {children}
      {submitError ? <p role="alert" className="text-sm text-danger">{submitError}</p> : null}
      <Button type="submit" variant="primary" startIcon={submitIcon} loading={busy || pending} disabled={submitDisabled} disabledReason={submitDisabledReason}>{submitLabel}</Button>
    </form>
  );
}
