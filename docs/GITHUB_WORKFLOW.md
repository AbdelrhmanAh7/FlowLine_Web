## GitHub Workflow Guidelines

### PR Requirements
- Mandatory CodeRabbit review
- Green checks (gate, docs, CodeQL)
- Security posture section filled
- Links to affected documentation

### Documentation
- All code changes must update relevant docs/implementation/ files
- E2E tests must be tagged with feat:<id> for feature mapping
- PR description must include E2E: not needed — <reason> waiver if applicable

### Testing
- Run pnpm e2e:army to trigger tests
- Verify test coverage via e2e-army/features/ suites