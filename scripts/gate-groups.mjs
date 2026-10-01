// Registry of named browser (Playwright) spec groups and the small-gate aliases used by scripts/gate.mjs.
// Every e2e/*.spec.ts must belong to exactly one group; checkManifest() (also run by tests/unit/gate-groups.test.ts and by
// the gate before any browser run) rejects unassigned, duplicated and stale entries, so a new spec can't silently drop out
// of a group run. Groups select concrete file names (never a grep), see docs/implementation/SMALL_GATES.md.
import { readdirSync } from "node:fs";

export const SPEC_DIR = "e2e";
export const SPEC_SUFFIX = ".spec.ts";

export const GROUPS = {
  product: {
    description: "public pages, theming, i18n/RTL, responsive, motion, hydration, company builder, client UX",
    specs: [
      "ambient-background", "arabic", "client-ux", "company-builder", "hydration", "landing", "landing-interaction",
      "prehydration", "reduced-motion", "responsive", "theme",
    ],
  },
  auth: {
    description: "sign-up/sign-in journey, private beta, tenancy, SSO (Zitadel)",
    specs: ["beta", "journey", "tenancy", "zitadel", "zitadel-platform"],
  },
  editor: {
    description: "flow builder canvas, keyboard, forms, library, runs, failures, local scenarios",
    specs: ["builder-keyboard", "canvas", "dynamic-form", "failures", "keyboard-surfaces", "library", "local-scenarios", "run-states"],
  },
  platform: {
    description: "AI hub, admin panel, phase 2/3 platform features",
    specs: ["admin-panel", "ai-hub", "ai-hub-wave-b", "phase2", "phase3"],
  },
};

// Small non-browser gates: names accepted by --only/--skip that expand to several steps.
export const STEP_ALIASES = { static: ["lint", "typecheck", "evidence"] };

const SAFE_FILE = /^[A-Za-z0-9._-]+$/; // spec file names end up in shell command lines

export const groupFiles = (groups, name) => groups[name].specs.map((s) => `${SPEC_DIR}/${s}${SPEC_SUFFIX}`);

export function listSpecFiles(dir = SPEC_DIR) {
  return readdirSync(dir).filter((f) => f.endsWith(SPEC_SUFFIX)).sort().map((f) => `${SPEC_DIR}/${f}`);
}

/** Problems with the registry against the specs on disk (empty array = every spec is in exactly one group). */
export function checkManifest(groups = GROUPS, onDisk = listSpecFiles()) {
  const problems = [];
  const owner = new Map();
  for (const [name, g] of Object.entries(groups)) {
    if (!g.specs.length) problems.push(`group "${name}" is empty`);
    for (const file of groupFiles(groups, name)) {
      if (!SAFE_FILE.test(file.replace(`${SPEC_DIR}/`, ""))) problems.push(`unsafe spec file name ${file}`);
      if (owner.has(file)) problems.push(`${file} is in both "${owner.get(file)}" and "${name}"`);
      else owner.set(file, name);
    }
  }
  for (const file of onDisk) if (!owner.has(file)) problems.push(`${file} is not assigned to any group (add it to scripts/gate-groups.mjs)`);
  const disk = new Set(onDisk);
  for (const [file, name] of owner) if (!disk.has(file)) problems.push(`group "${name}" lists ${file}, which does not exist`);
  // Playwright treats a positional argument as a substring filter on the path; one name must not select another spec.
  const all = [...new Set([...owner.keys(), ...disk])];
  for (const a of all) for (const b of all) if (a !== b && b.endsWith(a)) problems.push(`${a} would also select ${b}`);
  return problems;
}

/** Validated selection: group names -> { groups, files } (files in registry order, no duplicates). Throws on unknown names. */
export function resolveGroups(names, groups = GROUPS) {
  if (!names.length) throw new Error(`--group needs at least one group name (groups: ${Object.keys(groups).join(", ")})`);
  const unknown = names.filter((n) => !Object.hasOwn(groups, n));
  if (unknown.length) throw new Error(`unknown group "${unknown.join('", "')}" (groups: ${Object.keys(groups).join(", ")})`);
  const unique = [...new Set(names)];
  return { groups: unique, files: unique.flatMap((n) => groupFiles(groups, n)) };
}

/** Expands small-gate aliases (static -> lint,typecheck,evidence); other names pass through unchanged. */
export const expandSteps = (names) => [...new Set(names.flatMap((n) => STEP_ALIASES[n] ?? [n]))];
