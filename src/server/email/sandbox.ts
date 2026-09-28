export function recipientAllowed(email: string, rules = process.env.FLOWLINE_EMAIL_ALLOWED_RECIPIENTS): boolean {
  if (!rules?.trim()) return true;
  const value = email.trim().toLowerCase();
  return rules.split(",").some((entry) => {
    const rule = entry.trim().toLowerCase();
    if (!rule) return false;
    const domain = value.split("@")[1];
    if (domain && (rule.startsWith("*.") || rule.startsWith("."))) return domain.endsWith(rule.replace(/^\*/, "")) && domain.length > rule.replace(/^\*/, "").length;
    if (rule.startsWith("@")) return value.endsWith(rule) && value.length > rule.length;
    return value === rule;
  });
}
