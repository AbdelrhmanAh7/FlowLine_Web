# Issue #100: remaining harness validation

The prior test-stack questions are answered: the disposable flowline_test database
on port 55432 works, and the issue's army/browser tests have now executed.
Real local HTTP Range/immutable delivery also passes without #99.

AC7 still needs hosted production before/after Lighthouse, measured CLS and actual
added Next client gzip. The current instruction prohibits a local full build, and
production deployment is owner-only; this session cannot supply those measurements.
The harness should collect them on the final candidate before marking #100 complete.
Also run the required hosted browser/check matrix and arrange the inherited large
implementation into reviewable layers without rewriting pushed history here.

Verification setup: without #99 media, FLOWLINE_ENV=test and fl_test_demo=fixture
must be active before landing navigation. A missing production manifest correctly
shows no demo per AC8; do not change that behavior to satisfy a fixture-free probe.
