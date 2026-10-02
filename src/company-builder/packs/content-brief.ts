import type { FlowGraph } from "@/engine/types";
import { lit, type PackCheck, type TaskPack } from "./types";

/**
 * Pack 3 — content preparation: structured brief + template-based copy options → review. It produces TEXT only;
 * images, design files and video are not produced (no tool for them exists) and are reported as unavailable.
 * The copy options are template text (labelled as such), not model output.
 */

const X = [0, 300, 600, 900, 1200];

const STRUCTURE = `(
  $b := brief;
  $points := $append([], $b.key_points[$type($) = "string" and $length($trim($)) > 0]);
  {
    "product": $b.product, "audience": $b.audience, "goal": $b.goal, "channel": $b.channel,
    "language": $b.language = "ar" ? "ar" : "en",
    "tone": $b.tone ? $b.tone : "friendly",
    "key_points": $points,
    "missing": $append([], $filter(["product", "audience", "goal"], function($k) { $not($exists($lookup($b, $k))) or $lookup($b, $k) = "" })),
    "requested_unsupported": $append([], $filter($append([], $b.formats), function($f) { $f in ${lit(["image", "images", "design_file", "design_files", "video", "logo"])} }))
  }
)`;

const COPY = `(
  $ar := language = "ar";
  $ready := $count(missing) = 0 and $count(key_points) > 0;
  {
    "brief": { "product": product, "audience": audience, "goal": goal, "channel": channel, "tone": tone, "key_points": key_points },
    "missing": missing,
    "requested_unsupported": requested_unsupported,
    "generated_by": "template",
    "copy_options": $ready ? $append([], $map(key_points, function($p) {
      $ar ? (product & " — " & $p & ". مناسب لـ" & audience & ".") : (product & " — " & $p & ". Made for " & audience & ".")
    })) : [],
    "call_to_action": $ready ? ($ar ? "تواصل معنا لمعرفة المزيد." : "Get in touch to learn more.") : null
  }
)`;

export const contentBriefPack: TaskPack = {
  id: "content-brief",
  version: 1,
  department: "content",
  nodeTypes: ["trigger.manual", "transform.json", "logic.condition", "output"],
  capabilities: ["structure_brief", "template_copy_options"],
  inputContract: "content_brief_v1",
  outputContract: "brief_and_copy_for_review_v1",
  outputKeys: ["content_draft", "needs_input"],

  compile(params, label): FlowGraph {
    return {
      nodes: [
        { id: "brief", type: "trigger.manual", position: { x: X[0]!, y: 120 }, data: { label: label("brief"), config: { samplePayload: JSON.stringify(this.sample(params), null, 2) } } },
        { id: "structure", type: "transform.json", position: { x: X[1]!, y: 120 }, data: { label: label("structure"), config: { expression: STRUCTURE } } },
        { id: "copy", type: "transform.json", position: { x: X[2]!, y: 120 }, data: { label: label("copy"), config: { expression: COPY } } },
        { id: "ready", type: "logic.condition", position: { x: X[3]!, y: 120 }, data: { label: label("ready"), config: { expression: "$count(copy_options) > 0" } } },
        { id: "draft", type: "output", position: { x: X[4]!, y: 36 }, data: { label: label("draft"), config: { key: "content_draft", expression: "" } } },
        { id: "missing", type: "output", position: { x: X[4]!, y: 216 }, data: { label: label("missing"), config: { key: "needs_input", expression: '{ "missing": missing, "requested_unsupported": requested_unsupported, "key_points": $count(brief.key_points) }' } } },
      ],
      edges: [
        { id: "e1", source: "brief", target: "structure", sourceHandle: "out" },
        { id: "e2", source: "structure", target: "copy", sourceHandle: "out" },
        { id: "e3", source: "copy", target: "ready", sourceHandle: "out" },
        { id: "e4", source: "ready", target: "draft", sourceHandle: "true" },
        { id: "e5", source: "ready", target: "missing", sourceHandle: "false" },
      ],
    };
  },

  sample(params) {
    const ar = params.language === "ar";
    return {
      sample: true,
      brief: ar
        ? { product: "باقة التنظيف الشهرية", audience: "المكاتب الصغيرة", goal: "حجوزات جديدة", channel: "linkedin", tone: "friendly", language: "ar", key_points: ["زيارة أسبوعية", "مواد آمنة"], formats: ["copy_text"] }
        : { product: "Monthly cleaning plan", audience: "small offices", goal: "new bookings", channel: "linkedin", tone: "friendly", language: "en", key_points: ["Weekly visit", "Safe products"], formats: ["copy_text"] },
    };
  },

  evaluate(output, input): PackCheck[] {
    const d = output.content_draft as { copy_options?: string[]; generated_by?: string; brief?: { product?: string } } | undefined;
    const n = output.needs_input as { missing?: string[] } | undefined;
    const brief = (input as { brief?: { product?: string; key_points?: unknown[] } } | null)?.brief;
    const checks: PackCheck[] = [{ id: "one_outcome", passed: Boolean(d) !== Boolean(n) }];
    if (d) {
      checks.push({ id: "copy_present", passed: (d.copy_options?.length ?? 0) > 0 });
      checks.push({ id: "copy_mentions_product", passed: Boolean(brief?.product) && (d.copy_options ?? []).every((c) => c.includes(String(brief!.product))) });
      checks.push({ id: "labelled_template", passed: d.generated_by === "template" });
    }
    if (n) checks.push({ id: "missing_listed", passed: (n.missing?.length ?? 0) > 0 || (brief?.key_points?.length ?? 0) === 0 });
    return checks;
  },

  fixtures() {
    return [
      { id: "content-complete", input: { brief: { product: "P1", audience: "A", goal: "G", key_points: ["one", "two"], language: "en" } }, expect: (o) => [{ id: "two_options", passed: ((o.content_draft as { copy_options?: unknown[] })?.copy_options?.length ?? 0) === 2 }] },
      { id: "content-missing", input: { brief: { product: "P1", key_points: ["one"] } }, expect: (o) => [{ id: "asks_for_input", passed: ((o.needs_input as { missing?: string[] })?.missing ?? []).includes("audience") }] },
      {
        id: "content-image-request",
        input: { brief: { product: "P1", audience: "A", goal: "G", key_points: ["one"], formats: ["images", "copy_text"] } },
        expect: (o) => [{ id: "image_reported_unsupported", passed: ((o.content_draft as { requested_unsupported?: string[] })?.requested_unsupported ?? []).includes("images") }],
      },
    ];
  },
};
