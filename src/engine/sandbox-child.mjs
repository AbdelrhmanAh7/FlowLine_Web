// JSONata sandbox child process. The parent (execution worker) sends one request at a
// time, enforces a wall-clock timeout by killing this process, and caps its heap with
// --max-old-space-size, so a runaway expression can only ever kill this child.
// Plain JS so it starts without a TS loader.
import jsonata from "jsonata";

const MAX_PAD = 100_000;
const describe = (e) => (e?.position != null ? `${e.message} (at character ${e.position})` : String(e?.message ?? e));

function limitedPad(str, width, char) {
  if (str === undefined) return undefined;
  if (Math.abs(width) > MAX_PAD) throw { code: "EXPRESSION_LIMIT", message: `$pad width is limited to ${MAX_PAD}` };
  const s = String(str);
  const c = char === undefined || char === "" ? " " : String(char);
  const n = Math.abs(width) - s.length;
  if (n <= 0) return s;
  const fill = c.repeat(Math.ceil(n / c.length)).slice(0, n);
  return width > 0 ? s + fill : fill + s;
}

async function evaluate({ source, input, bindings, maxDepth, maxBytes }) {
  let expr;
  try {
    expr = jsonata(source);
  } catch (e) {
    return { ok: false, code: "EXPRESSION_SYNTAX", message: describe(e) };
  }
  // Defence in depth: $pad is the one built-in that allocates an arbitrary size up front.
  expr.registerFunction("pad", limitedPad, "<x-n?s?:s>");
  let depth = 0;
  expr.assign(Symbol.for("jsonata.__evaluate_entry"), (_e, _i, env) => {
    if (env?.isParallelCall) return;
    depth += 1;
    if (depth > maxDepth) throw { code: "EXPRESSION_DEPTH", message: `Expression exceeded the recursion limit (${maxDepth})` };
  });
  expr.assign(Symbol.for("jsonata.__evaluate_exit"), (_e, _i, env) => {
    if (env?.isParallelCall) return;
    depth -= 1;
  });
  let result;
  try {
    result = await expr.evaluate(input, bindings ?? undefined);
  } catch (e) {
    const code = typeof e?.code === "string" && e.code.startsWith("EXPRESSION_") ? e.code : "EXPRESSION_RUNTIME";
    return { ok: false, code, message: describe(e) };
  }
  const text = result === undefined ? "null" : (JSON.stringify(result) ?? "null");
  if (text.length > maxBytes) return { ok: false, code: "VALUE_TOO_LARGE", message: `Result is larger than ${Math.round(maxBytes / 1024)}KB` };
  return { ok: true, json: text };
}

async function pdfText({ base64, maxBytes }) {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const bytes = Uint8Array.from(Buffer.from(base64, "base64"));
  const pdf = await getDocumentProxy(bytes);
  if (pdf.numPages > 50) return { ok: false, code: "FILE_TOO_LARGE", message: "PDFs are limited to 50 pages" };
  const { text } = await extractText(pdf, { mergePages: true });
  const out = JSON.stringify({ text, pages: pdf.numPages });
  if (out.length > maxBytes) return { ok: false, code: "VALUE_TOO_LARGE", message: "Extracted text is larger than 256KB" };
  return { ok: true, json: out };
}

process.on("message", async (req) => {
  let res;
  try {
    res = req.op === "pdf_text" ? await pdfText(req) : await evaluate(req);
  } catch (e) {
    res = { ok: false, code: "EXPRESSION_RUNTIME", message: describe(e) };
  }
  process.send?.({ id: req.id, ...res });
});
