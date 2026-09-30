import type { FlowGraph } from "@/engine/types";
import { lit, type PackCheck, type TaskPack } from "./types";

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
    $computed := $round($sum($map($append([], $ok), function($l) { $l.qty * $l.unit_price })), 2);
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

  evaluate(output, input): PackCheck[] {
    const res = (output.ledger_draft ?? output.discrepancy_review) as { ledger_rows?: { amount: number; currency: string }[]; totals_by_currency?: { currency: string; total: number }[]; discrepancies?: unknown[]; empty?: boolean } | undefined;
    const raw = (input as { documents?: unknown } | null)?.documents;
    const docs = Array.isArray(raw) ? raw : raw ? [raw] : [];
    const checks: PackCheck[] = [{ id: "one_outcome", passed: Boolean(output.ledger_draft) !== Boolean(output.discrepancy_review) }];
    if (!res) return checks;
    checks.push({ id: "not_empty", passed: docs.length > 0 && !res.empty });
    const rows = res.ledger_rows ?? [];
    const totals = res.totals_by_currency ?? [];
    checks.push({ id: "every_document_accounted", passed: rows.length + (res.discrepancies?.length ?? 0) === docs.length });
    // Totals per currency must equal the sum of that currency's ledger rows (no cross-currency addition).
    checks.push({
      id: "totals_per_currency",
      passed: totals.every((t) => Math.abs(t.total - rows.filter((r) => r.currency === t.currency).reduce((s, r) => s + r.amount, 0)) < 0.005) && new Set(totals.map((t) => t.currency)).size === totals.length,
    });
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
