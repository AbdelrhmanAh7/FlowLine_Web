import { cookies } from "next/headers";
import { Suspense } from "react";
import { EmailFlow } from "../email-flow";
export default async function Page() {
  const locale = (await cookies()).get("fl_locale")?.value === "en" ? "en" : "ar";
  return <Suspense><EmailFlow mode="forgot" locale={locale} /></Suspense>;
}
