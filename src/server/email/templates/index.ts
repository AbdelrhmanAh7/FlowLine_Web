import { ar } from "./ar";
import { en } from "./en";

import { dirOf, LOCALE_COOKIE, resolveLocale, type Locale } from "@/i18n/config";

export type { Locale };
export type TemplateKind = "verify" | "reset" | "invite" | "delete" | "passwordChanged" | "emailVerified" | "emailChanged";

/**
 * The language of an email follows the UI language of the request that caused it — read exactly like the pages do
 * (the `fl_locale` cookie via the shared i18n config: "ar" | "en", Arabic when absent or invalid).
 */
export function requestLocale(request?: Request): Locale {
  const cookie = request?.headers.get("cookie") ?? "";
  const value = cookie.split(";").map((part) => part.trim().split("=")).find(([name]) => name === LOCALE_COOKIE)?.[1];
  return resolveLocale(value);
}

const escape = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function renderEmail(kind: TemplateKind, link: string, locale: Locale = "ar") {
  const copy = locale === "ar" ? ar : en;
  const item = copy[kind];
  const safe = escape(link);
  const html = `<!doctype html><html lang="${locale}" dir="${dirOf(locale)}"><body style="margin:0;background:#f4f1eb;color:#1c2430;font-family:Arial,sans-serif"><div style="max-width:560px;margin:32px auto;background:#fff;border:1px solid #dedbd5;border-radius:12px;overflow:hidden"><div style="background:#172534;color:#fff;padding:24px 32px;font-size:22px;font-weight:700">Flowline</div><div style="padding:32px"><h1 style="font-size:24px;margin:0 0 18px">${escape(item.title)}</h1><p style="line-height:1.8">${escape(item.body)}</p><p style="margin:28px 0"><a href="${safe}" style="display:inline-block;background:#bc6b42;color:#fff;text-decoration:none;padding:13px 22px;border-radius:7px;font-weight:700">${escape(item.action)}</a></p><p style="font-size:13px;line-height:1.8">${escape(copy.fallback)}<br><a href="${safe}" style="word-break:break-all;color:#9e5636">${safe}</a></p></div><div style="padding:20px 32px;background:#f4f1eb;font-size:12px;line-height:1.7;color:#52606d">${escape(item.why)} ${escape(copy.ignore)}</div></div></body></html>`;
  const text = `${item.title}\n\n${item.body}\n\n${item.action}: ${link}\n\n${item.why} ${copy.ignore}`;
  return { subject: item.subject, html, text };
}
