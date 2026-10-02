/** Pure gate selection helpers so prerequisite selection can be regression-tested without starting a gate. */
export function selectGateSteps({ all, browsers, only, skip, tier, browserStacks, browsersMode }) {
  const selected = new Set(
    all.filter((name) => (only.length === 0 || only.includes(name)) && !skip.includes(name)).filter(
      (name) => tier === "full" || only.includes(name) || !["firefox", "webkit"].includes(name),
    ),
  );
  const hasBrowser = browsers.some((name) => selected.has(name));
  if (hasBrowser && !skip.includes("stack")) selected.add("stack");

  const parallelProjects = browsersMode === "parallel" ? browsers.filter((name) => selected.has(name)) : [];
  const stackCount = parallelProjects.length > 1
    ? parallelProjects.reduce((count, name) => count + (name === "chromium" ? browserStacks : Math.ceil(browserStacks / 2)), 0)
    : browserStacks;

  if (hasBrowser && selected.has("stack") && stackCount > 1) {
    if (skip.includes("build")) throw new Error("multiple browser stacks require the build step; omit --skip=build or use --stacks=1");
    selected.add("build");
  }
  return { selected, parallelProjects, stackCount };
}
