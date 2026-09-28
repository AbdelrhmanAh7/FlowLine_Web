import { Suspense } from "react";
import { cookies } from "next/headers";
import { EmailFlow } from "../email-flow";
export default async function Page() {
  const locale = (await cookies()).get("fl_locale")?.value === "en" ? "en" : "ar";
  return <Suspense><EmailFlow mode="reset" locale={locale} /></Suspense>;
}
