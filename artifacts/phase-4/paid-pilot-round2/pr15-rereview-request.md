@coderabbitai review

Fixed the integration fixture configuration in `6da59d727c500c06f9a236766c4035623b10aaa2`: the SSO and email-verification suites now explicitly request open registration and restore the original mode afterward. Production beta fail-closed behavior and every assertion remain unchanged. The earlier run's 540 passed / 9 failed evidence is preserved. Independent Fable exact-diff review preceded push; no local stack, browser, build or test was run. Fresh GitHub full CI must validate this head.

One changed-head re-review in the available third conservative slot. Included route only; no usage-based billing or account setting change is authorized. Resource is displaced until the next rolling window. Do not treat green review or historical tests as live-provider or paid-pilot acceptance.
