# Prep for #107: Safe part of #24: Enable secret scanning + push protection, Dependabot alerts and Copilot code review

> Offline floor prep (2026-10-10T12:57Z): capacity 0 — claude: claude daily budget spent (12% of 8% week-points) ; codex: Codex daily budget spent (9 of 7 week-points today; opencode: held until 16:35Z (opencode rate-limited 6× in a r; agy: held until 10-14 14:35Z (4 d 2 h) ( error: Individ. Zero-spend groundwork for the engineer who takes this issue next — not an implementation.

## Brief

Document security posture requirements and fix shell commands in docs

1. Update AGENTS.md to document the new 'Security posture' PR requirement.
2. In docs/security/REPO_SECURITY_SETTINGS.md, replace unescaped angle brackets with YOUR_PR_NUMBER or $PR_NUMBER in the copy-pasteable shell commands.

Parent #24 is blocked by a hard rule (repository secrets / account settings); this sub-task excludes that part.

<!-- nql-cto-safe-part parent=24 -->

## Acceptance checklist

- (none in the issue — derive from the brief)

## Candidate files

- `.coderabbit.yaml`
- `.env.example`
- `.github/actions/gate-report/action.yml`
- `.github/actions/setup-gate/action.yml`
- `.github/ci/env.test.template`
- `.github/workflows/claude.yml`
- `.github/workflows/gate.yml`
- `.husky/pre-commit`
- `.husky/pre-push`
- `AGENTS.md`
- `DESIGN_DECISIONS.md`
- `Dockerfile`
- `NEXT_ACTION.md`
- `README.md`
- `SCOPE_MATRIX.md`

## Existing tests nearby

- `e2e/landing-interaction.spec.ts`
- `e2e/tools/webkit-env.mjs`
- `tests/integration/p2-actions.test.ts`
- `tests/unit/focused-run-env.test.ts`
- `tests/unit/gate-groups.test.ts`
- `tests/unit/gate-selection.test.ts`
- `tests/unit/run-output-redaction.test.ts`
- `tests/unit/test-integration-env.test.ts`
- `tests/unit/zitadel-env-config.test.ts`

## Test plan (ollama:qwen3:8b)

- **Test Case 1**: Verify secret scanning is enabled in repo settings  
  **Setup**: Check GitHub repo settings under Security > Secret scanning  
  **Assertion**: Secret scanning is enabled  
  **File**: `.github/workflows/gate.yml`  

- **Test Case 2**: Validate push protection is configured  
  **Setup**: Navigate to repo settings > Actions > General  
  **Assertion**: Push protection is enabled for all branches  
  **File**: `.github/workflows/gate.yml`  

- **Test Case 3**: Confirm Dependabot alerts are active  
  **Setup**: Check repo settings > Security > Dependabot  
  **Assertion**: Dependabot is enabled for all dependencies  
  **File**: `.github/workflows/gate.yml`  

- **Test Case 4**: Test shell command substitution in REPO_SECURITY_SETTINGS.md  
  **Setup**: Replace `<PR_NUMBER>` with actual PR number in markdown  
  **Assertion**: Shell commands execute without syntax errors  
  **File**: `docs/security/REPO_SECURITY_SETTINGS.md`  

- **Test Case 5**: Ensure AGENTS.md reflects security posture requirements  
  **Setup**: Review AGENTS.md for new security PR requirement  
  **Assertion**: Security posture requirement is clearly documented  
  **File**: `AGENTS.md`  

- **Test Case 6**: Validate shell command escaping in documentation  
  **Setup**: Check for unescaped `<` and `>` in shell commands  
  **Assertion**: All angle brackets are escaped or replaced  
  **File**: `docs/security/REPO_SECURITY_SETTINGS.md`  

- **Test Case 7**: Test CI/CD workflow for security settings  
  **Setup**: Run `.github/workflows/gate.yml` with security checks  
  **Assertion**: Workflow fails if security settings are misconfigured  
  **File**: `.github/workflows/gate.yml`  

- **Test Case 8**: Confirm pre-commit hooks enforce security rules  
  **Setup**: Run `husky pre-commit` with security checks  
  **Assertion**: Commit is blocked if security rules are violated  
  **File**: `.husky/pre-commit`  

- **Test Case 9**: Test environment variables for security settings  
  **Setup**: Run `.github/ci/env.test.template` with security flags  
  **Assertion**: Environment variables are correctly set for security  
  **File**: `.github/ci/env.test.template`  

- **Test Case 10**: Validate security settings in Docker build  
  **Setup**: Run `Dockerfile` with security-related environment variables  
  **Assertion**: Docker build respects security settings  
  **File**: `Dockerfile`
