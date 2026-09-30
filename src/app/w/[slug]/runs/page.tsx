import type { Metadata } from "next";
import { Suspense } from "react";
import { getT } from "@/i18n/server";
import { RunInspector } from "./inspector";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("meta.runs") };
}

export default function RunsPage() {
  return (
    <Suspense>
      <RunInspector />
    </Suspense>
  );
}
