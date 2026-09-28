"use client";

import { Button } from "@/components/ui";
import { useT } from "@/i18n/client";

export function LandingDocsLink() {
  const t = useT();
  return (
    <Button variant="ghost" size="sm" className="!h-auto !px-0 text-base hover:!bg-transparent" disabledReason={t("landing.docsReason")}>
      {t("landing.nav.docs")}
    </Button>
  );
}
