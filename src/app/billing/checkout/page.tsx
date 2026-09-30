import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { resolveCheckoutPage } from "@/billing/checkout-page";
import { getT } from "@/i18n/server";
import { getCurrentUser } from "@/server/access";
import { HttpError } from "@/server/http";
import { PaddleCheckout } from "./paddle-checkout";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("meta.billingCheckout") };
}

/**
 * Paddle checkout page: Paddle sends the buyer here as `/billing/checkout?ws=<slug>&_ptxn=txn_…`
 * (the transaction's `checkout.url`). Members with billing rights get Paddle.js; everyone else 404s.
 */
export default async function CheckoutPage({ searchParams }: { searchParams: Promise<{ ws?: string | string[]; _ptxn?: string | string[] }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  let state;
  try {
    state = await resolveCheckoutPage(user, await searchParams);
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) notFound();
    throw e;
  }
  return <PaddleCheckout state={state} />;
}
