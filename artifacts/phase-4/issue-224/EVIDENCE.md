# Evidence: Issue #224 — i18n: Mizano provider strings (en + ar)

**Issue:** [#224](https://github.com/AbdelrhmanAh7/FlowLine_Web/issues/224) (Part of [#145](https://github.com/AbdelrhmanAh7/FlowLine_Web/issues/145))  
**PR:** [#256](https://github.com/AbdelrhmanAh7/FlowLine_Web/pull/256)  
**Branch:** `ai/224`  

## Numbered Acceptance Criteria

- **AC1 (English catalog strings):** In `src/i18n/messages/en.json`, under `integrationCatalog.mizano`, `description` is `"Connect FlowLine to your Mizano accounting workspace with a scoped API key."`, `fields.baseUrl.label` is `"Base URL"`, and `fields.token.label` is `"API key"`.
- **AC2 (Arabic catalog strings):** In `src/i18n/messages/ar.json`, under `integrationCatalog.mizano`, `description` is `"اربط FlowLine بمساحة عملك المحاسبية في Mizano بمفتاح API ذي نطاق محدد."`, `fields.baseUrl.label` is `"الرابط الأساسي"`, and `fields.token.label` is `"مفتاح API"`.
- **AC3 (Action preservation):** Existing action translations (`list_overdue_invoices`, `create_customer`, `create_draft_quote`) are preserved and kept unchanged; documentation in `docs/integrations/SUPPORTED-ACTIONS.md` and `docs/implementation/PHASE4_BETA_REPORT.md` accurately reflects that existing action translations are kept unchanged.
- **AC4 (Provider definition sync):** In `src/integrations/providers/mizano.ts`, the default provider definition matches `en.json` (`description: "Connect FlowLine to your Mizano accounting workspace with a scoped API key."`, `token` label `"API key"`, and `baseUrl` label `"Base URL"`), satisfying `tests/unit/i18n-content-text.test.ts`.
- **AC5 (Testing and Verification):** Unit tests in `tests/unit/i18n.test.ts` (17/17 tests), `tests/unit/i18n-content-text.test.ts` (41/41 tests), `tests/unit/e2e-army-tooling.test.ts` (12/12 tests), `pnpm typecheck`, and `pnpm lint` pass with exit code 0.
- **AC6 (E2E army test hygiene):** The `@issue-224` e2e-army scenario is co-located in `e2e-army/147-mizano-create-customer-and-quote.e2e.ts` ensuring repo stays within the hub cap of at most 8 top-level `e2e-army/*.e2e.ts` files.

---

## Verification Matrix

| AC ID | Description | Verification Command / Check | Observed Exit Code / Output | Result |
|---|---|---|---|---|
| **AC1** | English strings in `en.json` match specification | `vitest run tests/unit/i18n.test.ts -t "keeps Mizano connection labels"` | Exit code 0; 1 passed | PASS |
| **AC2** | Arabic strings in `ar.json` match translation | `vitest run tests/unit/i18n.test.ts -t "keeps Mizano connection labels"` | Exit code 0; 1 passed | PASS |
| **AC3** | Actions kept unchanged; docs accurately state existing translations retained | `grep -n "Existing action translations are kept unchanged" docs/integrations/SUPPORTED-ACTIONS.md docs/implementation/PHASE4_BETA_REPORT.md` | Exit code 0; both files contain exact wording | PASS |
| **AC4** | `mizano.ts` provider definition matches `en.json` | `vitest run tests/unit/i18n-content-text.test.ts -t "mizano"` | Exit code 0; 1 passed | PASS |
| **AC5** | Unit tests, content text tests, typecheck, lint pass | `pnpm lint && nice -n 10 pnpm exec vitest run tests/unit/i18n.test.ts --maxWorkers=2 && pnpm typecheck` | Exit code 0; 17 unit tests passed, tsc clean, eslint clean | PASS |
| **AC6** | E2E-army suite stays <= 8 files | `ls -1 e2e-army/*.e2e.ts \| wc -l` and `vitest run tests/unit/e2e-army-tooling.test.ts` | Exit code 0; exactly 8 files, 12/12 tooling tests passed | PASS |

---

## Changed Covering Tests

- `tests/unit/i18n.test.ts`:
  - Added test case: `keeps Mizano connection labels and existing action translations (#224)` asserting `en.integrationCatalog.mizano.description`, `baseUrl.label`, `token.label`, and Arabic equivalents in `ar.integrationCatalog.mizano`.
- `e2e-army/147-mizano-create-customer-and-quote.e2e.ts`:
  - Contains natural language E2E test `@issue-224 AC: Mizano connection text and required fields are localized in English and Arabic` covering both `en` and `ar` with RTL validation.

---

## Command Outputs

### 1. `pnpm lint && nice -n 10 pnpm exec vitest run tests/unit/i18n.test.ts --maxWorkers=2`
```text
> flowline@0.1.0 lint
> eslint . --cache --cache-location node_modules/.cache/eslint/

 RUN  v5.0.2

 ✓ |unit| tests/unit/i18n.test.ts (17 tests) 47ms
   ✓ i18n catalogues (5)
     ✓ English has exactly the Arabic keys (runtime mirror of the type check) 6ms
     ✓ keeps Mizano connection labels and existing action translations (#224) 1ms
     ✓ a catalogue with a missing key does not type-check 0ms
     ✓ every Arabic plural fills all six CLDR forms, every English plural has `other` 1ms
     ✓ no empty strings except deliberate empty zero-forms 26ms
   ✓ locale resolution (2)
   ✓ translator (4)
   ✓ formatting keeps Western digits in Arabic (4)
   ✓ API error messages (2)

 Test Files  1 passed (1)
      Tests  17 passed (17)
   Start at  02:10:20
   Duration  289ms
```

### 2. `pnpm typecheck`
```text
> flowline@0.1.0 typecheck
> tsc --noEmit
(Exit code: 0)
```

### 3. `vitest run tests/unit/i18n-content-text.test.ts`
```text
 ✓ |unit| tests/unit/i18n-content-text.test.ts (41 tests) 11ms
   ✓ integration catalog text (15)
     ✓ mizano: category, description, actions and connect fields are Arabic; English is the source 0ms

 Test Files  1 passed (1)
      Tests  41 passed (41)
   Duration  357ms
```

### 4. `vitest run tests/unit/e2e-army-tooling.test.ts`
```text
 ✓ |unit| tests/unit/e2e-army-tooling.test.ts (12 tests) 1452ms
   ✓ e2e-army docs and suite (4)
     ✓ README and DEVELOPER_GUIDE state the hub's real cap (up to 8 top-level e2e-army/*.e2e.ts files), and the repo stays within it 1ms

 Test Files  1 passed (1)
      Tests  12 passed (12)
   Duration  1.64s
```
