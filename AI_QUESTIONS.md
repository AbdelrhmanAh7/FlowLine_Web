# Issue #164 — follow-ups not in this PR

Shipped: paste-based import of an n8n workflow (webhook, function/code, HTTP request → FlowLine nodes; other nodes become "Unsupported n8n node" placeholders that block runs).

Not done, for follow-up issues:
1. File upload of the n8n `.json` (the dialog takes pasted text only).
2. Branching: only the first output of each n8n node is imported (IF/Switch branches are dropped).
3. n8n Function/Code bodies are copied unchanged; they use n8n's `items` API and must be reviewed before running.
4. n8n expressions (`={{ … }}`) and credentials are not translated; URLs containing expressions become placeholders.
5. Arabic/RTL e2e check for the import dialog is not in the army test yet.
6. The e2e-army test (`e2e-army/164-import-n8n.e2e.ts`) has not been run locally; it runs in the verify job.
