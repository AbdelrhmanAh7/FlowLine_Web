# WebKit launcher interruption, not a test result

The first cp18 WebKit container stayed in `npm install @playwright/test@1.63.0` for roughly four minutes. Its npm log showed other tarballs downloaded but the pinned test package still pending. A separate request inside the same container fetched that exact public package successfully (HTTP 200, 8749 bytes).

The test-owned npm launcher was terminated; the wrapper's subsequent bootstrap failed before any Playwright tests began. The container exited and run-with-stack.sh stopped ports 3100/4010/4011. The stack/session/output records are preserved here.

WebKit was then restarted with the same command and unchanged checkpoint 18, after shutdown. Its completed result is in ../final-webkit/. This is an explicit infrastructure-launch retry, not a skipped or flaky test counted as passing. Chromium and Firefox were not running concurrently.
