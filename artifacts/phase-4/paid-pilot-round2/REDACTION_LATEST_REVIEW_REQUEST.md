@coderabbitai review

Please review latest head 037af94a6465e3f57d37bdeb354e1bd66ef41da7. Test fixtures now explicitly exercise fail-closed beta admission: integration fixtures declare their intended mode; Playwright states carry the existing test-only cookie; hydration custom states include it; the synthetic SSO newcomer receives a pending workspace invitation through the existing API. Global beta mode remains unset to preserve Company Builder trial guards. Assertions, baselines, retries and timeouts are unchanged. Failed CI attempts remain recorded; latest full gate is pending.
