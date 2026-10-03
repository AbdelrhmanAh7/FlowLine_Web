Independent exactdiff prepushreview/Fabledecision16. PR17auth08355ae full Gate37098120270 FAIL onlyChromiumSSO; static/integration/Firefox/WebKitPASS. Readonly bounded failureartifact11265645911 shows strict mode violation: getByRole(alert) resolves expectedparagraph verify your email ownership AND __next-route-announcer__. Existing sameSSOspec alreadyfilters otheralerts by expectedtext. Minimalone-linefixturefix filters thislocator byexactexistingexpectedsubstring then keeps SAMEtoContainText assertion, no .first(), no reduced checks/baseline/retry/timeout change. No productsourcechanged, no localtest/browser/build/stack, readinstalledNextPlaywrightguidefull. FullfreshCIrequired. REVIEWstillpending onoriginalhead atlastsnapshot; ifreviewfinishesbeforepush currentcoveragewillneednewrequestslot; updatequeuebudget never over3/rollinghour. No merge, paidroute/provider/inviteoutsideCI. APPROVEorBLOCK exactonefilediff beforecommit/pushexistingPR17; no restacking queuedMFA necessary untilactualparentchange handled viaFable. ExactSHA256 fb0724fba2266d8f6e632401258d7c1fc7a4fa3f800478a84fafce20896a83e1. FailureevidenceDATA below
{
  "artifactId": 11265645911,
  "zipSHA256": "67cef0fe3ed8d701445ced7a7e8ccda02dee512e366be5b3130459579d602fa0",
  "diagnostics": [
    {
      "path": "test-results/chromium-3-report.txt",
      "logSHA256": "c20d0125a6e06da1bbf12845d2804bb0d7b0ba35516d64937b0110741de08d3b",
      "excerpts": [
        "  1) [chromium] \u203a e2e/phase3.spec.ts:290:5 \u203a SSO: owner tests configuration without linking; mailbox-proven members explicitly confirm; existing accounts are never taken over \n\n    Error: expect(locator).toContainText(expected) failed\n\n    Locator: getByRole('alert')\n    Expected substring: \"verify your email ownership\"\n    Error: strict mode violation: getByRole('alert') resolved to 2 elements:\n        1) <p role=\"alert\" class=\"rounded-md border border-danger/40 bg-danger/5 px-3 py-2 text-base text-danger\">Create your Flowline account and verify your emai\u2026</p> aka getByText('Create your Flowline account')\n        2) <div role=\"alert\" aria-live=\"assertive\" id=\"__next-route-announcer__\"></div> aka locator('[id=\"__next-route-announcer__\"]')\n\n    Call log:\n      - Expect \"toContainText\" getByRole('alert') with timeout 10000ms\n      - waiting for getByRole('alert')\n\n\n      325 |   await p2.getByRole(\"button\", { name: \"Sign in with SSO\" }).click();\n      326 |   await expect(p2).toHaveURL(/\\/sign-in\\?sso_error=/);\n    > 327 |   await expect(p2.getByRole(\"alert\")).toContainText(\"verify your email ownership\");\n          |                                       ^\n      328 |   const invitation = await (await page.request.post(`/api/workspaces/${workspace.id}/invites`, { data: { email: newcomer, role: \"editor\" } })).json();\n      329 |   await signUpVerified(p2.request, newcomer);\n      330 |   expect((await p2.request.post(`/api/invites/${new URL(invitation.url).pathname.split(\"/\").at(-1)}`)).ok()).toBeTruthy();"
      ]
    }
  ]
}

diff --git a/e2e/phase3.spec.ts b/e2e/phase3.spec.ts
index 8c78684..ba4e4b0 100644
--- a/e2e/phase3.spec.ts
+++ b/e2e/phase3.spec.ts
@@ -324,7 +324,7 @@ test("SSO: owner tests configuration without linking; mailbox-proven members exp
   await p2.getByLabel("Workspace slug").fill(workspace.slug);
   await p2.getByRole("button", { name: "Sign in with SSO" }).click();
   await expect(p2).toHaveURL(/\/sign-in\?sso_error=/);
-  await expect(p2.getByRole("alert")).toContainText("verify your email ownership");
+  await expect(p2.getByRole("alert").filter({ hasText: "verify your email ownership" })).toContainText("verify your email ownership");
   const invitation = await (await page.request.post(`/api/workspaces/${workspace.id}/invites`, { data: { email: newcomer, role: "editor" } })).json();
   await signUpVerified(p2.request, newcomer);
   expect((await p2.request.post(`/api/invites/${new URL(invitation.url).pathname.split("/").at(-1)}`)).ok()).toBeTruthy();
