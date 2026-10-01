import type { FlowGraph } from "@/engine/types";
import { lit, sameJson, type PackCheck, type PackParams, type TaskPack } from "./types";

/**
 * Pack 2 — invoice/document organisation: supported extraction (structured rows from CSV/JSON/text the existing file
 * node already reads; no OCR) → deterministic totals and currency validation → discrepancy review → draft ledger rows.
 * Different currencies are NEVER added together: totals are per currency.
 */

const X = [0, 300, 600, 900, 1200];

const VALIDATE = (currencies: string[]) => `(
  $allowed := ${lit(currencies)};
  $docs := $type(documents) = "array" ? documents : ($exists(documents) ? [documents] : []);
  $append([], $map($docs, function($d) {(
    $ok := $filter($append([], $d.lines), function($l) { $type($l.qty) = "number" and $type($l.unit_price) = "number" });
    $computed := $count($ok) = 0 ? 0 : $round($sum($map($append([], $ok), function($l) { $l.qty * $l.unit_price })), 2);
    {
      "file": $d.file, "vendor": $d.vendor, "invoice_number": $d.invoice_number, "date": $d.date, "currency": $d.currency,
      "computed_total": $computed,
      "stated_total": $d.stated_total,
      "malformed_lines": $count($append([], $d.lines)) - $count($append([], $ok)),
      "mismatch": $type($d.stated_total) = "number" ? $abs($computed - $d.stated_total) > 0.01 : $exists($d.stated_total),
      "missing": $append([], $filter(["vendor", "invoice_number", "date", "currency", "lines", "stated_total"], function($k) { $not($exists($lookup($d, $k))) })),
      "unexpected_currency": $exists($d.currency) and $count($allowed) > 0 and $not($d.currency in $allowed)
    }
  )}))
)`;

const ORGANISE = `(
  $rows := $append([], $);
  $bad := function($r) { $r.mismatch or $count($r.missing) > 0 or $r.malformed_lines > 0 or $r.unexpected_currency };
  $currencies := $append([], $distinct($append([], $rows[$not($bad($))].currency)));
  {
    "documents": $count($rows),
    "empty": $count($rows) = 0,
    "totals_by_currency": $append([], $map($currencies, function($c) { { "currency": $c, "total": $round($sum($rows[currency = $c and $not($bad($))].computed_total), 2), "count": $count($rows[currency = $c and $not($bad($))]) } })),
    "discrepancies": $append([], $rows[$bad($)]),
    "ledger_rows": $append([], $rows[$not($bad($))].{ "date": date, "vendor": vendor, "reference": invoice_number, "currency": currency, "amount": computed_total })
  }
)`;

/** JSONata's `$round` (half to even, shifting the decimal point through the exponent), reimplemented for the evaluator. */
export function roundHalfEven(arg: number, precision: number): number {
  let parts = arg.toString().split("e");
  const shifted = +(parts[0] + "e" + (parts[1] ? +parts[1] + precision : precision));
  let r = Math.round(shifted);
  if (Math.abs(r - shifted) === 0.5 && Math.abs(r % 2) === 1) r -= 1;
  parts = r.toString().split("e");
  r = +(parts[0] + "e" + (parts[1] ? +parts[1] - precision : -precision));
  return Object.is(r, -0) ? 0 : r;
}

const fieldOf = (v: unknown, k: string): unknown => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>)[k] : undefined);
/** Drops undefined values, as a JSONata object constructor does. */
const defined = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

/**
 * What the pack must produce for this input and these params, computed in TypeScript from the documents themselves
 * (same rules as VALIDATE/ORGANISE: half-even rounding to 2 places, per-currency totals over clean documents only).
 */
export function expectedInvoiceResult(input: unknown, params: PackParams) {
  const allowed = Array.isArray(params.currencies) ? params.currencies.filter((c) => /^[A-Z]{3}$/.test(c)) : [];
  const raw = fieldOf(input, "documents");
  const docs: unknown[] = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
  const rows = docs.map((d) => {
    const lv = fieldOf(d, "lines");
    const lines: unknown[] = lv === undefined ? [] : Array.isArray(lv) ? lv : [lv];
    const ok = lines.filter((l) => typeof fieldOf(l, "qty") === "number" && typeof fieldOf(l, "unit_price") === "number");
    const computed = roundHalfEven(ok.reduce<number>((s, l) => s + (fieldOf(l, "qty") as number) * (fieldOf(l, "unit_price") as number), 0), 2);
    const stated = fieldOf(d, "stated_total");
    const currency = fieldOf(d, "currency");
    const missing = ["vendor", "invoice_number", "date", "currency", "lines", "stated_total"].filter((k) => fieldOf(d, k) === undefined);
    const malformed = lines.length - ok.length;
    const mismatch = typeof stated === "number" ? Math.abs(computed - stated) > 0.01 : stated !== undefined;
    const unexpected = currency !== undefined && allowed.length > 0 && !allowed.includes(currency as string);
    return {
      bad: mismatch || missing.length > 0 || malformed > 0 || unexpected,
      row: defined({
        file: fieldOf(d, "file"), vendor: fieldOf(d, "vendor"), invoice_number: fieldOf(d, "invoice_number"), date: fieldOf(d, "date"), currency,
        computed_total: computed, stated_total: stated, malformed_lines: malformed, mismatch, missing, unexpected_currency: unexpected,
      }),
    };
  });
  const clean = rows.filter((r) => !r.bad).map((r) => r.row);
  const discrepancies = rows.filter((r) => r.bad).map((r) => r.row);
  const currencies = [...new Set(clean.map((r) => r.currency))];
  const totals = currencies.map((c) => {
    const of = clean.filter((r) => r.currency === c);
    return { currency: c, total: roundHalfEven(of.reduce<number>((s, r) => s + (r.computed_total as number), 0), 2), count: of.length };
  });
  const ledgerRows = clean.map((r) => defined({ date: r.date, vendor: r.vendor, reference: r.invoice_number, currency: r.currency, amount: r.computed_total }));
  const review = docs.length === 0 || discrepancies.length > 0;
  const output: Record<string, unknown> = review
    ? { documents: docs.length, empty: docs.length === 0, discrepancies, ledger_rows: ledgerRows, totals_by_currency: totals }
    : { documents: docs.length, ledger_rows: ledgerRows, totals_by_currency: totals };
  return { key: review ? ("discrepancy_review" as const) : ("ledger_draft" as const), documents: docs.length, output };
}

export const invoiceOrganiserPack: TaskPack = {
  id: "invoice-organiser",
  version: 1,
  department: "finance",
  nodeTypes: ["trigger.manual", "transform.json", "logic.condition", "output"],
  capabilities: ["validate_document_fields", "recompute_totals", "per_currency_totals", "draft_ledger_rows", "flag_discrepancies"],
  inputContract: "extracted_documents_v1",
  outputContract: "ledger_draft_or_discrepancy_review_v1",
  outputKeys: ["ledger_draft", "discrepancy_review"],

  compile(params, label): FlowGraph {
    const currencies = Array.isArray(params.currencies) ? params.currencies.filter((c) => /^[A-Z]{3}$/.test(c)) : [];
    return {
      nodes: [
        { id: "documents", type: "trigger.manual", position: { x: X[0]!, y: 120 }, data: { label: label("documents"), config: { samplePayload: JSON.stringify(this.sample(params), null, 2) } } },
        { id: "validate", type: "transform.json", position: { x: X[1]!, y: 120 }, data: { label: label("validate"), config: { expression: VALIDATE(currencies) } } },
        { id: "organise", type: "transform.json", position: { x: X[2]!, y: 120 }, data: { label: label("organise"), config: { expression: ORGANISE } } },
        { id: "needs-review", type: "logic.condition", position: { x: X[3]!, y: 120 }, data: { label: label("needs-review"), config: { expression: "empty or $count(discrepancies) > 0" } } },
        { id: "review", type: "output", position: { x: X[4]!, y: 36 }, data: { label: label("review"), config: { key: "discrepancy_review", expression: '{ "documents": documents, "empty": empty, "discrepancies": discrepancies, "ledger_rows": ledger_rows, "totals_by_currency": totals_by_currency }' } } },
        { id: "ledger", type: "output", position: { x: X[4]!, y: 216 }, data: { label: label("ledger"), config: { key: "ledger_draft", expression: '{ "documents": documents, "ledger_rows": ledger_rows, "totals_by_currency": totals_by_currency }' } } },
      ],
      edges: [
        { id: "e1", source: "documents", target: "validate", sourceHandle: "out" },
        { id: "e2", source: "validate", target: "organise", sourceHandle: "out" },
        { id: "e3", source: "organise", target: "needs-review", sourceHandle: "out" },
        { id: "e4", source: "needs-review", target: "review", sourceHandle: "true" },
        { id: "e5", source: "needs-review", target: "ledger", sourceHandle: "false" },
      ],
    };
  },

  sample(params) {
    const cur = Array.isArray(params.currencies) && params.currencies[0] && /^[A-Z]{3}$/.test(params.currencies[0]) ? params.currencies[0] : "SAR";
    return {
      sample: true,
      documents: [
        { file: "sample-invoice-1001.csv", vendor: "Sample Office Supplies", invoice_number: "S-1001", date: "2026-09-01", currency: cur, lines: [{ description: "Printer paper", qty: 4, unit_price: 25 }, { description: "Toner", qty: 1, unit_price: 180 }], stated_total: 280 },
        { file: "sample-invoice-1002.csv", vendor: "Sample Cleaning Co", invoice_number: "S-1002", date: "2026-09-03", currency: cur, lines: [{ description: "Monthly cleaning", qty: 1, unit_price: 450 }], stated_total: 500 },
      ],
    };
  },

  evaluate(output, input, params): PackCheck[] {
    // The expected result is derived from the trial INPUT and params (never from the run's own rows): an edited flow
    // that invents rows, drops discrepancies or empties the totals must not pass.
    const exp = expectedInvoiceResult(input, params);
    const actualKey = output.ledger_draft != null ? "ledger_draft" : output.discrepancy_review != null ? "discrepancy_review" : null;
    const res = (actualKey ? output[actualKey] : undefined) as { documents?: unknown; ledger_rows?: unknown[]; totals_by_currency?: unknown[]; discrepancies?: unknown[]; empty?: unknown } | undefined;
    const checks: PackCheck[] = [
      { id: "one_outcome", passed: Boolean(output.ledger_draft) !== Boolean(output.discrepancy_review) },
      { id: "correct_outcome", passed: actualKey === exp.key },
    ];
    if (!res) return checks;
    checks.push({ id: "not_empty", passed: exp.documents > 0 && res.empty !== true });
    checks.push({ id: "every_document_accounted", passed: res.documents === exp.documents && (res.ledger_rows?.length ?? 0) + (res.discrepancies?.length ?? 0) === exp.documents });
    checks.push({ id: "ledger_rows_exact", passed: sameJson(res.ledger_rows, exp.output.ledger_rows) });
    checks.push({ id: "discrepancies_exact", passed: sameJson(res.discrepancies, exp.output.discrepancies) });
    // Totals are per currency (never added across currencies) and must cover exactly the clean documents' amounts.
    checks.push({ id: "totals_per_currency", passed: sameJson(res.totals_by_currency, exp.output.totals_by_currency) });
    checks.push({ id: "exact_output", passed: sameJson(res, exp.output) });
    return checks;
  },

  fixtures(params) {
    const cur = Array.isArray(params.currencies) && params.currencies[0] ? String(params.currencies[0]) : "SAR";
    const doc = (n: string, total: number, extra: Record<string, unknown> = {}) => ({ file: `f-${n}.csv`, vendor: "Vendor " + n, invoice_number: n, date: "2026-09-10", currency: cur, lines: [{ description: "x", qty: 2, unit_price: 50 }], stated_total: total, ...extra });
    return [
      { id: "inv-clean", input: { documents: [doc("1", 100), doc("2", 100)] }, expect: (o) => [{ id: "ledger_ready", passed: ((o.ledger_draft as { ledger_rows?: unknown[] })?.ledger_rows?.length ?? 0) === 2 }] },
      { id: "inv-mismatch", input: { documents: [doc("1", 100), doc("2", 130)] }, expect: (o) => [{ id: "mismatch_flagged", passed: ((o.discrepancy_review as { discrepancies?: unknown[] })?.discrepancies?.length ?? 0) === 1 }] },
      { id: "inv-empty", input: { documents: [] }, expect: (o) => [{ id: "empty_flagged", passed: (o.discrepancy_review as { empty?: boolean })?.empty === true }] },
      {
        id: "inv-malformed",
        input: { documents: [{ ...doc("3", 100), lines: [{ description: "bad", qty: "two", unit_price: 50 }] }, { vendor: "No number" }] },
        expect: (o) => [{ id: "malformed_flagged", passed: ((o.discrepancy_review as { discrepancies?: unknown[] })?.discrepancies?.length ?? 0) === 2 }],
      },
      {
        id: "inv-two-currencies",
        input: { documents: [doc("4", 100), doc("5", 100, { currency: cur === "USD" ? "EUR" : "USD" })] },
        expect: (o) => {
          const t = ((o.ledger_draft ?? o.discrepancy_review) as { totals_by_currency?: { currency: string }[] })?.totals_by_currency ?? [];
          return [{ id: "currencies_not_combined", passed: t.every((x, i, a) => a.findIndex((y) => y.currency === x.currency) === i) }];
        },
      },
    ];
  },
};
