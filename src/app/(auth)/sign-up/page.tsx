import type { Metadata } from "next";
import { Suspense } from "react";
import { getT } from "@/i18n/server";
import { AuthForm } from "../auth-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("meta.signUp") };
}

export default function SignUpPage() {
  return (
    <Suspense>
      <AuthForm mode="sign-up" />
    </Suspense>
  );
}
