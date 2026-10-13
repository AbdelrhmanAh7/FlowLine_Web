import { NextResponse } from "next/server";
import { testFeaturesEnabled } from "@/server/faults";
import { notFound, route } from "@/server/http";
import { TEST_AUTO_VERIFY_COOKIE } from "@/server/test-auto-verify";

/**
 * TEST ENVIRONMENT ONLY — 404 everywhere else (#124). Opening this URL turns the sign-up auto-verify opt-in on for the
 * CALLER's browser (the fl_test_auto_verify=1 cookie, src/server/test-auto-verify.ts) and continues to /sign-up, so a
 * tester that can only navigate pages (the hub verifier, a cloud test generator) can opt in without setting cookies.
 * Always /sign-up (relative): no redirect target is taken from the request.
 */
export const GET = route(async () => {
  if (!testFeaturesEnabled()) throw notFound();
  const res = new NextResponse(null, { status: 303, headers: { location: "/sign-up", "cache-control": "no-store" } });
  res.cookies.set(TEST_AUTO_VERIFY_COOKIE, "1", { path: "/", sameSite: "lax", httpOnly: true });
  return res;
});
