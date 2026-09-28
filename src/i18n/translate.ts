import { createElement, Fragment, type ReactNode } from "react";
import { intlLocale, type Locale } from "./config";
import { formatDate, formatDuration, formatNumber, formatPercent, formatRelative } from "./format";
import { ar } from "./messages/ar";
import { en } from "./messages/en";
import type { MessageKey, Messages, PluralKey, PluralMessage, Vars } from "./types";

export const CATALOGUES: Record<Locale, Messages> = { ar, en };

export interface Translator {
  (key: MessageKey, vars?: Vars): string;
  /** Picks the CLDR plural form for `count` (Arabic: zero/one/two/few/many/other); `{count}` is the formatted number. */
  plural(key: PluralKey, count: number, vars?: Vars): string;
  /** Like `t()`, but placeholders may be React nodes (e.g. `<strong>`); returns a fragment. */
  rich(key: MessageKey, vars: Record<string, ReactNode>): ReactNode;
  /** True when the key exists (useful for optional, data-driven keys such as template ids). */
  has(key: string): boolean;
  locale: Locale;
  number(n: number, opts?: Intl.NumberFormatOptions): string;
  percent(v: number | null | undefined): string;
  date(v: string | number | Date, opts?: Intl.DateTimeFormatOptions): string;
  relative(v: string | number | Date | null | undefined, now?: number): string;
  duration(ms: number | null | undefined): string;
}

function lookup(messages: Messages, key: string): unknown {
  let node: unknown = messages;
  for (const part of key.split(".")) {
    if (node == null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

function interpolate(template: string, vars: Vars | undefined): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}

export function createTranslator(locale: Locale): Translator {
  const messages = CATALOGUES[locale];
  // A key missing at runtime (only possible via a cast) falls back to English, then to the key itself.
  const resolve = (key: string): unknown => lookup(messages, key) ?? lookup(CATALOGUES.en, key);
  const rules = new Intl.PluralRules(intlLocale(locale));

  const t = ((key: MessageKey, vars?: Vars) => {
    const v = resolve(key);
    return typeof v === "string" ? interpolate(v, vars) : key;
  }) as Translator;

  t.plural = (key, count, vars) => {
    const v = resolve(key) as PluralMessage | undefined;
    if (!v || typeof v !== "object") return key;
    const form = v[rules.select(count) as keyof PluralMessage] ?? v.other;
    return interpolate(form, { count: formatNumber(locale, count), ...vars });
  };

  t.rich = (key, vars) => {
    const v = resolve(key);
    if (typeof v !== "string") return key;
    const parts = v.split(/(\{\w+\})/g).filter(Boolean).map((part) => {
      const m = /^\{(\w+)\}$/.exec(part);
      return m && m[1]! in vars ? vars[m[1]!] : part;
    });
    // Spread as separate children so React needs no keys.
    return createElement(Fragment, null, ...parts);
  };

  t.has = (key) => lookup(messages, key) !== undefined;
  t.locale = locale;
  t.number = (n, opts) => formatNumber(locale, n, opts);
  t.percent = (v) => formatPercent(locale, v);
  t.date = (v, opts) => formatDate(locale, v, opts);
  t.relative = (v, now) => formatRelative(locale, v, now, { never: t("common.never") });
  t.duration = (ms) => formatDuration(locale, ms);
  return t;
}
