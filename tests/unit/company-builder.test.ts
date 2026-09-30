import { describe, expect, it } from "vitest";
import { executeGraph } from "@/engine/execute";
import { applyAnswer, emptyState, inferFromText, nextQuestion, previousQuestion, readiness } from "@/company-builder/interview";
import { taskStatus } from "@/company-builder/lifecycle";
import type { InterviewState } from "@/company-builder/model";
import { PACKS } from "@/company-builder/packs";
import { composeBlueprint } from "@/company-builder/planner";
import { MAX_QUESTIONS, QUESTIONS } from "@/company-builder/questions";
import { compileTask, validateBlueprint } from "@/company-builder/validate";
import { applyProposal, blueprintProposalSchema, sanitiseText } from "@/company-builder/cli/envelope";
import { buildArgs, childEnv, classifyFailure, parseClaude } from "@/company-builder/cli/adapter";
import { isPrivateRequest, prototypeAccess, prototypeConfigProblem } from "@/server/company-builder/gate";
import { ar } from "@/i18n/messages/ar";
import { en } from "@/i18n/messages/en";

const SID = "00000000-0000-4000-8000-000000000001";
const ctx = { sessionId: SID, profileVersion: 1, connections: [], language: "en" as const };

function answerAll(pairs: [string, unknown][], start: InterviewState = emptyState()) {
  return pairs.reduce((s, [q, v]) => (v === "?" ? applyAnswer(s, q, null, true) : applyAnswer(s, q, v)), start);
}

describe("question bank", () => {
  it("every question declares target, reason copy, schema, sensitivity and a stage; ids are unique", () => {
    expect(new Set(QUESTIONS.map((q) => q.id)).size).toBe(QUESTIONS.length);
    for (const q of QUESTIONS) {
      expect(q.target).toBeTruthy();
      expect(["single", "multi", "text"]).toContain(q.kind);
      if (q.kind !== "text") expect(q.options!.length).toBeGreaterThan(1);
      expect((ar.companyBuilder.q as Record<string, { title: string; reason: string }>)[q.id]?.reason).toBeTruthy();
      expect((en.companyBuilder.q as Record<string, { title: string; reason: string }>)[q.id]?.title).toBeTruthy();
    }
  });
  it("every option has Arabic and English copy", () => {
    for (const q of QUESTIONS)
      for (const o of q.options ?? []) {
        if (o === "other") continue;
        expect((ar.companyBuilder.opt as Record<string, string>)[o], `${q.id}.${o}`).toBeTruthy();
        expect((en.companyBuilder.opt as Record<string, string>)[o], `${q.id}.${o}`).toBeTruthy();
      }
  });
});

describe("adaptive interview", () => {
  it("starts with the business situation and only asks department follow-ups that change the plan", () => {
    let s = emptyState();
    expect(nextQuestion(s)!.id).toBe("situation");
    s = answerAll([["situation", "improve"], ["offering", "We sell cleaning services to offices"], ["first_outcome", "finance"]], s);
    const next = nextQuestion(s)!;
    expect(next.department).toBe("finance");
    // Customer questions are never asked for a finance-only plan.
    let guard = 0;
    while (nextQuestion(s) && guard++ < 30) {
      const q = nextQuestion(s)!;
      expect(q.department === null || q.department === "finance").toBe(true);
      s = applyAnswer(s, q.id, q.kind === "text" ? "x" : q.kind === "multi" ? [q.options!.find((o) => o !== "none" && o !== "other")!] : q.options![0], false);
      if (q.id === "other_areas") break;
    }
  });

  it("infers from free text but never treats an inference as confirmed; the inferred question is asked to confirm", () => {
    const s = answerAll([["situation", "improve"], ["offering", "نستقبل طلبات العملاء على واتساب ونرسل فواتير عبر Gmail"]]);
    expect(s.facts.first_outcome).toMatchObject({ status: "inferred", source: "inference", value: "customer" });
    expect(s.facts.tools).toMatchObject({ status: "inferred", value: ["gmail"] });
    expect(s.facts.tools_mentioned_unsupported?.value).toContain("whatsapp");
    expect(nextQuestion(s)!.id).toBe("first_outcome");
    expect(readiness(s).complete).toBe(false);
    const confirmed = applyAnswer(s, "first_outcome", "customer");
    expect(confirmed.facts.first_outcome).toMatchObject({ status: "confirmed", source: "answer", version: 2 });
  });

  it("never re-asks a known fact, supports 'don't know yet', back and correction with versions", () => {
    let s = answerAll([["situation", "start"], ["offering", "?"], ["first_outcome", "content"]]);
    expect(s.facts.offering).toMatchObject({ status: "unknown", value: null });
    const asked = new Set<string>();
    for (let i = 0; i < 10 && nextQuestion(s); i++) {
      const q = nextQuestion(s)!;
      expect(asked.has(q.id)).toBe(false);
      asked.add(q.id);
      s = applyAnswer(s, q.id, null, true);
    }
    expect(previousQuestion(s, null)?.id).toBe(s.path.at(-1));
    const before = s.facts.first_outcome!.version;
    s = applyAnswer(s, "first_outcome", "finance", false, "correction");
    expect(s.facts.first_outcome).toMatchObject({ value: "finance", source: "correction", version: before + 1 });
    expect(s.answers.some((a) => a.questionId === "first_outcome" && a.value === "content")).toBe(true); // history kept
  });

  it("flags contradictions and asks again instead of guessing", () => {
    const s = answerAll([["situation", "improve"], ["first_outcome", "customer"], ["cust_channel", "email"], ["cust_reviewer", "team_member"], ["team", "solo"]]);
    expect(s.facts["customer.reviewer"]).toMatchObject({ status: "contradictory", conflict: "solo_team_reviewer" });
    expect(readiness(s).missing).toContain("customer.reviewer");
    expect(nextQuestion(s)!.id).toBe("cust_reviewer");
    const t = answerAll([["tools", ["none", "gmail"]]]);
    expect(t.facts.tools!.status).toBe("contradictory");
  });

  it("rejects invalid answers and oversize text; strips control characters", () => {
    expect(() => applyAnswer(emptyState(), "situation", "ceo")).toThrow();
    expect(() => applyAnswer(emptyState(), "situation", null, true)).toThrow(); // no "don't know" for the situation
    expect(() => applyAnswer(emptyState(), "offering", "x".repeat(601))).toThrow();
    const s = applyAnswer(emptyState(), "offering", "we\u0000 sell\u0007 tea");
    expect(s.facts.offering!.value).toBe("we sell tea");
  });

  it("reaches the stop rule in 5–8 meaningful questions for a typical path, and never exceeds the cap", () => {
    const s = answerAll([["situation", "improve"], ["offering", "online shop"], ["first_outcome", "customer"], ["cust_channel", "email"], ["cust_reviewer", "owner"]]);
    expect(readiness(s).complete).toBe(true);
    expect(s.path.length).toBe(5);
    let x = emptyState();
    for (let i = 0; i < 40 && nextQuestion(x); i++) {
      const q = nextQuestion(x)!;
      x = q.allowUnknown ? applyAnswer(x, q.id, null, true) : applyAnswer(x, q.id, q.options![0]);
    }
    expect(x.answers.length).toBeLessThanOrEqual(MAX_QUESTIONS);
  });

  it("Latin keywords match whole words only; a new description replaces the old inferences", () => {
    expect(inferFromText("We pride ourselves on excellent customer relationships").unsupportedTools).toEqual([]);
    expect(inferFromText("we postpone nothing").departments).toEqual([]);
    let s = applyAnswer(emptyState(), "offering", "We use WhatsApp and send invoices");
    expect(s.facts.tools_mentioned_unsupported).toBeDefined();
    s = applyAnswer(s, "offering", "We make content for clients", false, "correction");
    expect(s.facts.tools_mentioned_unsupported).toBeUndefined();
    expect(s.facts.first_outcome).toMatchObject({ status: "inferred", value: "content" });
  });

  it("the question cap counts distinct questions, not corrections", () => {
    let s = applyAnswer(emptyState(), "situation", "start");
    for (let i = 0; i < 30; i++) s = applyAnswer(s, "situation", i % 2 ? "start" : "improve", false, "correction");
    expect(nextQuestion(s)).not.toBeNull();
  });

  it("Arabic tokens match at word starts only (no substring false positives)", () => {
    expect(inferFromText("زيادة المبيعات").unsupportedTools).toEqual([]);
    expect(inferFromText("نستخدم الواتساب").unsupportedTools).toContain("whatsapp");
  });
});

describe("packs (executed by the real engine)", () => {
  const params = { approvedInfo: "Our monthly plan price is 300 SAR.\nDelivery is free inside Riyadh.", currencies: ["SAR"], language: "en" };
  for (const pack of PACKS) {
    it(`${pack.id}: sample run matches its business checks and every frozen fixture passes`, async () => {
      const graph = pack.compile(params, (id) => id);
      const res = await executeGraph(graph, pack.sample(params));
      expect(res.status).toBe("succeeded");
      expect(pack.evaluate(res.output, pack.sample(params), params).every((c) => c.passed)).toBe(true);
      for (const f of pack.fixtures(params)) {
        const r = await executeGraph(graph, f.input);
        expect(r.status, f.id).toBe("succeeded");
        expect(f.expect(r.output).every((c) => c.passed), f.id).toBe(true);
      }
    });
  }
  it("correct JSON with the wrong business result fails the outcome check", () => {
    const pack = PACKS.find((p) => p.id === "invoice-organiser")!;
    const wrong = { ledger_draft: { ledger_rows: [{ amount: 100, currency: "SAR" }, { amount: 50, currency: "USD" }], totals_by_currency: [{ currency: "SAR", total: 150 }] } };
    const checks = pack.evaluate(wrong, { documents: [{}, {}] }, params);
    expect(checks.find((c) => c.id === "totals_per_currency")!.passed).toBe(false);
  });
  it("approved information is embedded as data: quotes and JSONata syntax in it can't change the expression", async () => {
    const pack = PACKS.find((p) => p.id === "customer-triage")!;
    const evil = { approvedInfo: 'Price is 5 SAR." ; $eval("1") ; "\n}) ) $$ price' };
    const { graph, issues } = compileTask({ ...composeBlueprint(answerAll([["situation", "improve"], ["first_outcome", "customer"], ["cust_channel", "email"], ["cust_reviewer", "owner"]]), ctx).tasks[0]!, params: evil });
    expect(issues).toEqual([]);
    const r = await executeGraph(graph!, { request: { from: "a@b.c", subject: "price?", body: "What is the price?" } });
    expect(r.status).toBe("succeeded");
    expect(pack.evaluate(r.output, { request: { from: "a@b.c", body: "What is the price?" } }, evil).every((c) => c.passed)).toBe(true);
  });
});

describe("planner and validation", () => {
  const base = [["situation", "improve"], ["first_outcome", "customer"], ["cust_channel", "email"], ["cust_reviewer", "owner"], ["cust_info", "Prices start at 100 SAR."]] as [string, unknown][];

  it("builds roles/tasks only from registered packs, with a bounded agent where interpretation is justified", () => {
    const bp = composeBlueprint(answerAll(base), ctx);
    expect(validateBlueprint(bp).issues).toEqual([]);
    expect(bp.tasks.map((t) => [t.id, t.kind])).toEqual([["customer-triage", "workflow"], ["customer-answers", "agent"]]);
    expect(bp.tasks.find((t) => t.id === "customer-triage")!.connections[0]).toMatchObject({ provider: "gmail", status: "missing" });
    expect(bp.complete).toBe(true);
  });

  it("employee count never drives the number of agents; no always-on CEO agent", () => {
    const small = composeBlueprint(answerAll([...base, ["team", "solo"]]), ctx);
    const large = composeBlueprint(answerAll([...base, ["team", "large"]]), ctx);
    expect(large.tasks.length).toBe(small.tasks.length);
    expect(large.tasks.every((t) => t.trigger.kind !== "schedule")).toBe(true);
  });

  it("discloses unsupported tools, design outputs, channels and keeps recruitment planned", () => {
    const s = answerAll([["situation", "improve"], ["offering", "we sell on Shopify and talk on WhatsApp"], ["first_outcome", "content"], ["content_output", ["copy_text", "images"]], ["content_reviewer", "owner"], ["other_areas", ["recruitment", "customer"]], ["rec_need", "scheduling"], ["cust_channel", "chat"], ["cust_reviewer", "owner"], ["tools_other" as never, "?"]].filter(([q]) => q !== "tools_other") as [string, unknown][]);
    const bp = composeBlueprint(s, ctx);
    const codes = bp.blockers.map((b) => `${b.code}:${Object.values(b.params).join(",")}`);
    expect(codes).toEqual(expect.arrayContaining(["content_output_not_supported:images", "tool_not_supported:shopify", "tool_not_supported:whatsapp", "channel_not_supported:chat", "recruitment_planned_only:"]));
    expect(bp.tasks.find((t) => t.id === "recruitment-coordination")!.availability).toBe("planned");
    expect(bp.tasks.find((t) => t.id === "content-brief")!.unavailable).toContain("images");
  });

  it("an honest partial plan: missing essentials become blockers, currency is never guessed", () => {
    const s = answerAll([["situation", "start"], ["first_outcome", "finance"], ["fin_location", "?"], ["fin_currency", "?"]]);
    const bp = composeBlueprint(s, ctx);
    expect(bp.complete).toBe(false);
    expect(bp.blockers.map((b) => b.code)).toEqual(expect.arrayContaining(["currency_unknown", "fact_missing"]));
    expect(bp.tasks[0]!.params.currencies).toEqual([]);
    expect(bp.sampleData).toBe(true);
  });

  it("validation rejects unknown packs, invented permissions/providers and dependency cycles", () => {
    const bp = composeBlueprint(answerAll(base), ctx);
    const bad = structuredClone(bp);
    bad.tasks[0]!.packId = "ceo-agent";
    bad.tasks[0]!.permissions.push("root.shell");
    bad.tasks[0]!.connections.push({ provider: "bank_transfer", status: "missing", connectionId: null });
    bad.tasks[0]!.dependsOn = ["customer-answers"];
    bad.tasks[1]!.dependsOn = ["customer-triage"];
    const codes = validateBlueprint(bad).issues.map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(["UNKNOWN_PACK", "UNKNOWN_PERMISSION", "UNKNOWN_PROVIDER", "DEPENDENCY_CYCLE"]));
  });
});

describe("task lifecycle (Milestone C)", () => {
  const bp = composeBlueprint(answerAll([["situation", "improve"], ["first_outcome", "customer"], ["cust_channel", "email"], ["cust_reviewer", "owner"], ["cust_info", "Price 5."], ["other_areas", ["recruitment"]], ["rec_need", "scheduling"]]), ctx);
  const triage = bp.tasks.find((t) => t.id === "customer-triage")!;
  const recruit = bp.tasks.find((t) => t.id === "recruitment-coordination")!;
  const ok = { structurallyValid: true, ranWithoutErrors: true, matchedOutcome: true, checks: [] };
  it("distinguishes each state, per task", () => {
    expect(taskStatus({ task: triage, installed: false, verdict: null, activation: null }).state).toBe("plan_draft");
    expect(taskStatus({ task: triage, installed: true, verdict: null, activation: null }).state).toBe("requires_setup");
    expect(taskStatus({ task: triage, installed: true, verdict: ok, activation: null })).toMatchObject({ state: "sample_verified", canRequestActivation: true });
    expect(taskStatus({ task: triage, installed: true, verdict: { ...ok, matchedOutcome: false }, activation: null }).state).toBe("failed");
    expect(taskStatus({ task: triage, installed: true, verdict: ok, activation: "approval_required" }).state).toBe("approval_required");
    expect(taskStatus({ task: triage, installed: true, verdict: ok, activation: "active" }).state).toBe("active");
    expect(taskStatus({ task: triage, installed: true, verdict: ok, activation: "paused" }).state).toBe("paused");
    expect(taskStatus({ task: triage, installed: true, verdict: ok, activation: null, liveVerified: true }).state).toBe("live_verified");
    // A planned department doesn't block the operational one.
    expect(taskStatus({ task: recruit, installed: true, verdict: null, activation: null }).state).toBe("plan_draft");
  });
  it("an unknown reviewer blocks activation but not the sample trial", () => {
    const st = taskStatus({ task: { ...triage, reviewer: "unknown" }, installed: true, verdict: ok, activation: null });
    expect(st).toMatchObject({ canTry: true, canRequestActivation: false });
  });
});

describe("CLI envelope and adapter (no real CLI)", () => {
  const bp = composeBlueprint(answerAll([["situation", "improve"], ["first_outcome", "customer"], ["cust_channel", "email"], ["cust_reviewer", "owner"], ["cust_info", "Price 5."]]), ctx);
  it("sanitises personal data out of the brief", () => {
    expect(sanitiseText("mail me at a.b@example.com or +966 55 123 4567\u0007", 200)).toBe("mail me at [email] or [number]");
  });
  it("a proposal can't add tasks or change permissions; unknown ids are ignored and reported", () => {
    const p = blueprintProposalSchema.parse({ tasks: [{ taskId: "customer-answers", include: false, params: {} }, { taskId: "ceo", include: true, params: {} }], notes: "" });
    const { blueprint, ignored } = applyProposal(bp, p, "cli_claude");
    expect(ignored).toEqual(["ceo"]);
    expect(blueprint.tasks.map((t) => t.id)).toEqual(["customer-triage"]);
    expect(validateBlueprint(blueprint).issues).toEqual([]);
    expect(() => blueprintProposalSchema.parse({ tasks: [{ taskId: "customer-triage", include: true, params: { permissions: ["root"] } }], notes: "" })).toThrow();
  });
  it("an empty currency narrowing can't switch the currency check off (re-test N2)", () => {
    const fin = composeBlueprint(answerAll([["situation", "improve"], ["first_outcome", "finance"], ["fin_location", "email"], ["fin_currency", ["SAR", "USD"]], ["fin_reviewer", "owner"]]), ctx);
    const empty = applyProposal(fin, blueprintProposalSchema.parse({ tasks: [{ taskId: "invoice-organiser", include: true, params: { currencies: [] } }], notes: "" }), "cli_codex");
    expect(empty.blueprint.tasks[0]!.params.currencies).toEqual(["SAR", "USD"]);
    const narrowed = applyProposal(fin, blueprintProposalSchema.parse({ tasks: [{ taskId: "invoice-organiser", include: true, params: { currencies: ["USD", "EUR"] } }], notes: "" }), "cli_codex");
    expect(narrowed.blueprint.tasks[0]!.params.currencies).toEqual(["USD"]); // EUR was never confirmed
  });
  it("argument arrays are fixed: no shell, all tools disabled, no MCP, no fallback model; prompt only via stdin", () => {
    const env = { v: 1 as const, kind: "text_trial" as const, jobId: SID, cli: "claude" as const, taskId: "customer-triage" as const, text: "hi; rm -rf ~ $(whoami)" };
    const args = buildArgs("claude", env, "/tmp/job", {});
    expect(args).toEqual(expect.arrayContaining(["--print", "--tools", "", "--strict-mcp-config", "--restricted", "--no-session-persistence", "--disable-slash-commands"]));
    expect(args.join(" ")).not.toContain("rm -rf");
    expect(args).not.toContain("--fallback-model");
    expect(args).not.toContain("--dangerously-skip-permissions");
    const codex = buildArgs("codex", { ...env, cli: "codex" }, "/tmp/job", {});
    expect(codex.slice(0, 3)).toEqual(["exec", "--sandbox", "read-only"]);
    expect(codex.at(-1)).toBe("-");
  });
  it("the child environment carries nothing of Flowline's", () => {
    const e = childEnv({ HOME: "/h", PATH: "/bin", DATABASE_URL: "postgres://x", BETTER_AUTH_SECRET: "s", FLOWLINE_ENCRYPTION_KEY: "k", ANTHROPIC_API_KEY: "sk", OPENAI_API_KEY: "o" } as unknown as NodeJS.ProcessEnv);
    expect(Object.keys(e).sort()).toEqual(["HOME", "NO_COLOR", "PATH"]);
  });
  it("classifies login expiry, quota and permission denial separately", () => {
    expect(classifyFailure("Error: Not logged in. Please run /login", "")).toBe("AUTH_REQUIRED");
    expect(classifyFailure("Claude usage limit reached", "")).toBe("QUOTA_EXHAUSTED");
    expect(classifyFailure("Permission denied", "")).toBe("PERMISSION_DENIED");
    expect(classifyFailure("segfault", "")).toBe("CLI_FAILED");
  });
  it("keeps only what the CLI reported (no invented usage)", () => {
    const r = parseClaude(JSON.stringify({ is_error: false, structured_output: { a: 1 }, total_cost_usd: 0.5, usage: { input_tokens: 3, output_tokens: 4 }, session_id: "secret-ish", result: "raw transcript" }));
    expect(r.output).toBe('{"a":1}');
    expect(r.reported).toEqual({ totalCostUsd: 0.5, inputTokens: 3, outputTokens: 4 });
    expect(parseClaude(JSON.stringify({ is_error: false, structured_output: {} })).reported).toEqual({});
  });
});

describe("owner prototype gate", () => {
  const founder = { id: "founder-1", email: "f@x.test", name: "F" };
  const env = { FLOWLINE_CB_PROTOTYPE: "owner_cli", FLOWLINE_ENV: "development", FLOWLINE_CB_FOUNDER_USER_ID: "founder-1", FLOWLINE_CB_PROTOTYPE_WORKSPACE_ID: SID, FLOWLINE_CB_BOUND: "loopback" } as unknown as NodeJS.ProcessEnv;
  const req = (host: string, headers: Record<string, string> = {}) => new Request(`http://${host}/x`, { headers: { host, ...headers } });
  it("allows only the founder, in the designated workspace, on a loopback host", () => {
    expect(prototypeAccess(founder, SID, req("localhost:3000"), env)).toEqual({ allowed: true, reason: null });
    expect(prototypeAccess({ ...founder, id: "owner-2" }, SID, req("localhost:3000"), env)).toEqual({ allowed: false, reason: null });
    expect(prototypeAccess(founder, "00000000-0000-4000-8000-000000000002", req("localhost:3000"), env).reason).toBe("NOT_PROTOTYPE_WORKSPACE");
    expect(prototypeAccess(founder, SID, req("flowline.example.com"), env).reason).toBe("NOT_PRIVATE_HOST");
    expect(prototypeAccess(founder, SID, req("localhost:3000", { "x-forwarded-for": "203.0.113.9" }), env).reason).toBe("NOT_PRIVATE_HOST");
    expect(isPrivateRequest(req("127.0.0.1:3000", { "x-forwarded-for": "127.0.0.1" }), env)).toBe(true);
  });
  it("is disabled by default, in beta, and outside development/test builds", () => {
    expect(prototypeConfigProblem({} as NodeJS.ProcessEnv)).toBe("PROTOTYPE_DISABLED");
    expect(prototypeConfigProblem({ ...env, FLOWLINE_BETA_MODE: "invite_only" })).toBe("PROTOTYPE_NOT_ALLOWED_IN_BETA");
    expect(prototypeConfigProblem({ ...env, FLOWLINE_ENV: "staging" })).toBe("PROTOTYPE_NOT_ALLOWED_IN_THIS_BUILD");
    expect(prototypeConfigProblem({ ...env, FLOWLINE_CB_FOUNDER_USER_ID: "" })).toBe("PROTOTYPE_IDENTITY_NOT_CONFIGURED");
    // A server not started through the private-bind script never enables it (headers alone are client-controlled).
    expect(prototypeConfigProblem({ ...env, FLOWLINE_CB_BOUND: undefined })).toBe("PROTOTYPE_NOT_PRIVATELY_BOUND");
  });
  it("an approved private host also needs approved client addresses", () => {
    const e = { ...env, FLOWLINE_CB_BOUND: "private", FLOWLINE_CB_PRIVATE_HOSTS: "pi.local", FLOWLINE_CB_PRIVATE_CLIENTS: "192.168.1.20" } as NodeJS.ProcessEnv;
    expect(isPrivateRequest(req("pi.local:3000", { "x-forwarded-for": "192.168.1.20" }), { ...e, FLOWLINE_CB_BOUND: "loopback" })).toBe(false);
    expect(isPrivateRequest(req("pi.local:3000", { "x-forwarded-for": "192.168.1.20" }), e)).toBe(true);
    expect(isPrivateRequest(req("pi.local:3000", { "x-forwarded-for": "192.168.1.99" }), e)).toBe(false);
  });
});

describe("copy contract", () => {
  it("contains the required sentences verbatim (Arabic source)", () => {
    const c = ar.companyBuilder;
    expect(c.promise).toBe("ابنِ فريقًا رقميًا يعرف شغلك.");
    expect(c.supporting).toBe("أخبرنا بما تريد إنجازه. نجهز المهام على أدواتك، وتراجع الإجراءات المهمة قبل تنفيذها.");
    expect(c.start).toBe("اقترح فريقي");
    expect(c.facts.heading).toBe("راجع ما فهمناه عن مشروعك.");
    expect(c.plan.ready).toBe("خطة فريقك جاهزة للمراجعة.");
    expect(c.plan.draftNotice).toBe("هذه مسودة. لم يبدأ أي تشغيل تلقائي.");
    expect(c.trial.sampleNotice).toBe("تجربة ببيانات نموذجية — لم نتصل بحساباتك");
    expect(c.trial.finished).toBe("اكتمل التشغيل. راجع النتيجة.");
    expect(c.review.uncertain).toBe("لم نتمكن من تأكيد الإرسال. نتحقق قبل إعادة المحاولة.");
    expect(c.connectionNeeded).toBe("نحتاج ربط {service} لتشغيل {task}.");
  });
  it("makes no savings / replaced-staff / unlimited claims in either language", () => {
    const text = JSON.stringify([ar.companyBuilder, en.companyBuilder]).toLowerCase();
    for (const banned of ["unlimited", "save money", "replace your team", "replaces your staff", "fully autonomous", "غير محدود", "توفير المال"]) expect(text).not.toContain(banned);
  });
  it("every blocker, state, reason, task and capability produced by the code has copy", () => {
    const has = (obj: Record<string, unknown>, k: string) => typeof obj[k] === "string" || (typeof obj[k] === "object" && obj[k] !== null);
    for (const k of ["plan_draft", "requires_setup", "sample_verified", "live_verified", "approval_required", "active", "paused", "failed"]) expect(has(ar.companyBuilder.state, k)).toBe(true);
    for (const p of PACKS) for (const c of p.capabilities) expect(has(ar.companyBuilder.capability, c), c).toBe(true);
    for (const p of PACKS) {
      const g = p.compile({}, (id) => id);
      for (const n of g.nodes) expect(has((ar.companyBuilder.node as Record<string, Record<string, string>>)[p.id]!, n.id), `${p.id}.${n.id}`).toBe(true);
    }
  });
});
