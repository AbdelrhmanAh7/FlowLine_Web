# Reviewed release image inputs

CI, the release build/runtime and the package support policy select Node 22 LTS. Node's [release working group schedule](https://github.com/nodejs/Release#release-schedule) lists the Node 22 maintenance support end as 2027-04-30; reevaluate this policy before that date. The Node 25 release line is EOL according to the [official release table](https://nodejs.org/en/about/previous-releases).

Shipped builder frontend, base, sandbox default, CI database/sandbox pull and beta infrastructure inputs use immutable multi-platform manifest-index digests. Tags remain beside each digest as an update hint. Metadata resolution alone is not vulnerability scanning, image execution, platform support or beta deployment verification.

## Update procedure

1. Review supported runtime/security announcements and the intended image publisher. Choose compatible versions; do not change a tag alone.
2. Resolve the official image metadata with `docker buildx imagetools inspect <tag> --format '{{json .Manifest.Digest}}'`. This reads registry metadata and does not deploy or run an image.
3. Confirm the index contains the required platform(s), record the tag/index/platform digests and observation date in candidate evidence, and assess OS/runtime vulnerabilities.
4. Update related references together: release Dockerfile frontend/base; sandbox default and CI pull; CI/beta PostgreSQL; beta Caddy. Keep CI/build/runtime Node major and `package.json` support policy aligned.
5. Run the release-input policy test plus the relevant build/auth/worker/migration/sandbox checks on the selected runtime and architecture. Obtain independent exact-diff review and required CI before release processing.
6. Record the built application image's immutable digest and source SHA for the concrete owner-reviewed deployment/rollback plan. A `flowline:<sha>` label alone does not prove immutable bytes. Production deployment remains owner-gated.

Operator `FLOWLINE_CODE_IMAGE` overrides and dynamically supplied `FLOWLINE_IMAGE` deployment values are not validated by the source default-pin test. Their concrete bytes/digests and privilege properties must be inspected in the deployment plan; a runtime override must not be called certified because the default is pinned.
