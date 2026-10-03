Aligns declared and container runtime support to Node 22, pins reviewed image-index digests, and adds a policy test for executable release defaults. The candidate does not pull, build, run, or deploy these images.

Validation: Two focused release-input policy unit tests passed, with targeted ESLint and whitespace checks. Image digest metadata was read from registry manifests. See [focused evidence](artifacts/phase-4/paid-pilot-round1/security-runtime.md).

Limits: The host was Node 25.6.1, so actual Node 22 execution, production build, runtime/OS vulnerability review, platform bytes, deployment image overrides, and full CI remain unverified.

Exact candidate: `56f96d9ee31498d2a38d1b4516dadcc49b7ac352`; base `main` at `9641ad1e684cad7b84bd2385751ea19b0a9d4060`; 10 changed paths. Requires full CI and the final `gate`; no current CI or CodeRabbit result is claimed.
