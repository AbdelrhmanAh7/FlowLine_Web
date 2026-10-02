import { notFound } from "next/navigation";
import { companyBuilderEnabled } from "@/server/company-builder/gate";

/** Company Builder pages exist only when the feature flag is on (FLOWLINE_COMPANY_BUILDER=on). */
export default function CompanyBuilderLayout({ children }: { children: React.ReactNode }) {
  if (!companyBuilderEnabled()) notFound();
  return children;
}
