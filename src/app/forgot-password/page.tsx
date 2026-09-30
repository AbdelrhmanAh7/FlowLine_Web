import type { Metadata } from "next";
import { Suspense } from "react";
import { getT } from "@/i18n/server";
import { EmailFlow } from "../email-flow";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("meta.forgotPassword") };
}

export default function Page() {
  return (
    <Suspense>
      <EmailFlow mode="forgot" />
    </Suspense>
  );
}
