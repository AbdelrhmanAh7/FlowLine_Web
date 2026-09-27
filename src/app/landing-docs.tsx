"use client";

import { Button } from "@/components/ui";

export function LandingDocsLink() {
  return (
    <Button variant="ghost" size="sm" className="!h-auto !px-0 text-base hover:!bg-transparent" disabledReason="Public docs aren't published yet — the repo README covers local setup.">
      Docs
    </Button>
  );
}
