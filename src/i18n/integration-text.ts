import type { Translator } from "./translate";
import { dataText } from "./workspace-text";

/**
 * UI-layer text for the integration catalog (`src/integrations`, shared with the worker, stays English).
 * Provider descriptions, action titles/descriptions and connect-field labels are looked up by stable id
 * (`integrationCatalog.<provider>…`), categories by their English name (`integrationCategory.<category>`).
 * Anything not in the catalogue falls back to the provider's own English text, so nothing is ever hidden.
 * Brand names (`provider.name`), technical ids, scopes and placeholders are not translated.
 */

/** "github.get_pull_request" → ["github", "get_pull_request"]; null for an id without a provider prefix. */
function splitActionId(actionId: string): [string, string] | null {
  const i = actionId.indexOf(".");
  return i > 0 && i < actionId.length - 1 ? [actionId.slice(0, i), actionId.slice(i + 1)] : null;
}

export function providerCategory(t: Translator, category: string): string {
  return dataText(t, "integrationCategory", category);
}

export function providerDescription(t: Translator, provider: { id: string; description: string }): string {
  return dataText(t, `integrationCatalog.${provider.id}`, "description", provider.description);
}

function actionText(t: Translator, actionId: string, field: "title" | "description", fallback: string): string {
  const parts = splitActionId(actionId);
  return parts ? dataText(t, `integrationCatalog.${parts[0]}.actions.${parts[1]}`, field, fallback) : fallback;
}

export function actionTitle(t: Translator, action: { id: string; title: string }): string {
  return actionText(t, action.id, "title", action.title);
}

export function actionDescription(t: Translator, action: { id: string; description: string }): string {
  return actionText(t, action.id, "description", action.description);
}

/** The translated action title by id alone (canvas cards have no catalog at hand); null when there is none. */
export function actionTitleById(t: Translator, actionId: string): string | null {
  const title = actionText(t, actionId, "title", "");
  return title || null;
}

export function connectFieldLabel(t: Translator, providerId: string, field: { key: string; label: string }): string {
  return dataText(t, `integrationCatalog.${providerId}.fields.${field.key}`, "label", field.label);
}

export function connectFieldHelp(t: Translator, providerId: string, field: { key: string; help?: string }): string | undefined {
  if (!field.help) return undefined;
  return dataText(t, `integrationCatalog.${providerId}.fields.${field.key}`, "help", field.help);
}
