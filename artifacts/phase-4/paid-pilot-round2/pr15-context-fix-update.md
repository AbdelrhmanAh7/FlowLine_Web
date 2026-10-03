Latest correction pushed in `151a6b19094f9bdca5058b11f9636f47bfd29b34` after independent exact-diff Fable approval and verification of its three source conditions.

The earlier `6da59d7` fixture change cleared all 549 integration tests. The subsequent global test-mode attempt `5f07d88` conflicted with Company Builder's intentional development-trial and CLI guards; its failed CI is preserved. The latest commit reverts that global setting and uses the existing `FLOWLINE_ENV=test`-only beta cookie in EN/AR registration storage states. Arabic still has no locale cookie. Product admission, entitlement and prototype guards, and all assertions/retries/timeouts, remain unchanged.

The fresh full GitHub gate must validate this head. No local tests, stack, browser or build was run. Current-head CodeRabbit coverage remains required; another request waits for the shared rolling-hour slot. This status comment requests no review and does not enable billing or imply merge/pilot readiness.
