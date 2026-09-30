/** `rules`: the platform recipient allowlist (admin panel setting), comma-separated; empty = no restriction. */
export function recipientAllowed(email: string, rules: string | undefined): boolean {
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
