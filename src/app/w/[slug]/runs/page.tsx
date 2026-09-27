import { Suspense } from "react";
import { RunInspector } from "./inspector";

export const metadata = { title: "Run history" };

export default function RunsPage() {
  return (
    <Suspense>
      <RunInspector />
    </Suspense>
  );
}
