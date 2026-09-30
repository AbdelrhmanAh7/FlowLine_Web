// Regression guards for the visual-review findings DV2-V01 and DV2-V02 (artifacts/design-v2/BUGS.md).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("design-v2 visual-review fixes", () => {
  it("DV2-V01: React Flow's built-in node-type chrome is reset, so the 'output' node has no square outer border", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    const rule = css.match(/\.react-flow \.react-flow__node:is\(([^)]*)\)\s*\{\s*border:\s*0;\s*\}/);
    expect(rule, "reset rule present").not.toBeNull();
    for (const type of ["input", "default", "output", "group"]) expect(rule![1]).toContain(`.react-flow__node-${type}`);
    // The reset must come after the React Flow base stylesheet import so it wins the cascade.
    expect(css.indexOf('@import "@xyflow/react/dist/base.css"')).toBeLessThan(css.indexOf(rule![0]));
  });

  it("DV2-V02: the auth illustration takes node subtitles from the translated node catalogue", () => {
    const src = readFileSync("src/app/(auth)/auth-form.tsx", "utf8");
    expect(src).not.toMatch(/"(TRIGGER|TRANSFORM|OUTPUT) · [A-Z]+"/);
    expect(src.match(/nodeText\(t, "(trigger\.manual|transform\.json|output)", "subtitle"\)/g)).toHaveLength(3);
  });
});

describe("DV2-V03: user-authored names keep their own reading order inside RTL run views", () => {
  it("step and flow names in run timelines, the run dock and the dashboard are bidi-isolated (<bdi>)", () => {
    const inspector = readFileSync("src/app/w/[slug]/runs/inspector.tsx", "utf8");
    for (const expr of ["{s.nodeLabel}", "{step.nodeLabel}", "{s.label}", "{r.flowName}"]) expect(inspector, expr).toContain(`>${expr}</bdi>`);
    expect(readFileSync("src/components/builder/run-dock.tsx", "utf8")).toMatch(/<bdi[^>]*>\{s\.nodeLabel\}<\/bdi>/);
    const dash = readFileSync("src/app/w/[slug]/flows/dashboard.tsx", "utf8");
    expect(dash).toContain("<bdi>{f.name}</bdi>");
    expect(dash).toContain("<bdi>{r.flowName}</bdi>");
  });
});

describe("DV2-Q05 (retest): design-system modals declare aria-modal", () => {
  it("Dialog and Drawer content both set aria-modal=true", () => {
    const src = readFileSync("src/components/ui/dialog.tsx", "utf8");
    expect(src.match(/aria-modal="true"/g)).toHaveLength(2);
  });
});
