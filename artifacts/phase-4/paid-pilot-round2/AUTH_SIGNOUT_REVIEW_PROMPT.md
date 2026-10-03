Fabledecision18 exactdiffprepushreview. PR17latest3743e34 fullCI37099595026 passedstatic/integration(addedregressions)/FF/WK, ChromiumSSO nowgetsPASTerroralert,label,mailboxproof,confirmation,andmembership;fails newlyreachedemptybodyPOSTsign-out .ok false. EarlierclaimsallerrorsfixednotCIgreen. Installedbetter-call1.4 utilsgetBody: ifrequest.body exists andallowedMediaTypesnonempty noContentType gives415; NextPOSTmayexposeemptybodyasstream. AuthbranchdoesnotincludeRESOURCEcapBody thatnormalizesemptybody tonull. RealbrowserauthclientJSON contract; fixturepost currently hasno data/contenttype, so send {data:{}} explicitly andassertSAMEok withawaitresponse.text diagnostic. No productsourcechanged or assertionweakened. No localtest/stack/browser/build/retry; readNextPlaywrightguidealready. ActualresponsecodewasNOTrecorded inoldassert, so415 is SOURCE-supportedinference, freshCIarbiter; doNOTstateconfirmedresponse. Stronger failuremessage helpsifanotherissue. ApproveexactonefilediffSHA2563971723be410958a29284f3ff00f052d06d9bf389184f0e401a30a9ae18d1868 beforecommit/push. Batchbeforeonlymanualreviewnextslot>=05:34:15 maydelayuntilpush, user3/rollinghourdeadline06:30launch06:40push06:46stop,nomerge,$0. LatestCodeRabbit5threadsautoresolved onpushbutmustreplyeach afterfullCIandexactreview. FullfreshCIrequired; noqueueadvanceuntilboth. EvidenceDATA below
{
  "artifactId": 11265289097,
  "zipSHA256": "076388b19d07d370041139c5c5a8d6c2bab66f48b15fb7a140638e8c2013cdd1",
  "diagnostics": [
    {
      "path": "test-results/chromium-3-report.txt",
      "logSHA256": "7d9e0aef7609ba2152f9b86b887ca4dd5816a575a1fee2e29ce1ec735b7f0c4f",
      "excerpts": [
        "  1) [chromium] \u203a e2e/phase3.spec.ts:290:5 \u203a SSO: owner tests configuration without linking; mailbox-proven members explicitly confirm; existing accounts are never taken over \n\n    Error: expect(received).toBeTruthy()\n\n    Received: false\n\n      344 |   await page.goto(`/w/${workspace.slug}/settings`);\n      345 |   await expect(page.getByTestId(`member-${newcomer}`)).toContainText(/editor/i);\n    > 346 |   expect((await p2.request.post(\"/api/auth/sign-out\")).ok()).toBeTruthy();\n          |                                                              ^\n      347 |   await p2.goto(\"/sign-in\");\n      348 |   await p2.getByLabel(\"Workspace slug\").fill(workspace.slug);\n      349 |   await p2.getByRole(\"button\", { name: \"Sign in with SSO\" }).click();\n        at /home/runner/work/FlowLine_Web/FlowLine_Web/e2e/phase3.spec.ts:346:62\n\n    attachment #1: screenshot (image/png) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n    test-results/chromium-3/phase3-SSO-owner-tests-con-1306f-counts-are-never-taken-over-chromium/test-failed-1.png\n    \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n    attachment #2: screenshot (image/png) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n    test-results/chromium-3/phase3-SSO-owner-tests-con-1306f-counts-are-never-taken-over-chromium/test-failed-2.png\n    \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"
      ]
    }
  ]
}

diff --git a/e2e/phase3.spec.ts b/e2e/phase3.spec.ts
index ba4e4b0..c1155a1 100644
--- a/e2e/phase3.spec.ts
+++ b/e2e/phase3.spec.ts
@@ -343,7 +343,8 @@ test("SSO: owner tests configuration without linking; mailbox-proven members exp
   await expect(p2).toHaveURL(new RegExp(`/w/${workspace.slug}/flows`));
   await page.goto(`/w/${workspace.slug}/settings`);
   await expect(page.getByTestId(`member-${newcomer}`)).toContainText(/editor/i);
-  expect((await p2.request.post("/api/auth/sign-out")).ok()).toBeTruthy();
+  const signedOut = await p2.request.post("/api/auth/sign-out", { data: {} });
+  expect(signedOut.ok(), await signedOut.text()).toBeTruthy();
   await p2.goto("/sign-in");
   await p2.getByLabel("Workspace slug").fill(workspace.slug);
   await p2.getByRole("button", { name: "Sign in with SSO" }).click();
