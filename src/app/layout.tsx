import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
// Arabic glyphs only (the Latin UI keeps Inter): IBM Plex Sans Arabic, SIL OFL 1.1.
import "@fontsource/ibm-plex-sans-arabic/arabic-400.css";
import "@fontsource/ibm-plex-sans-arabic/arabic-500.css";
import "@fontsource/ibm-plex-sans-arabic/arabic-600.css";
import "@fontsource/ibm-plex-sans-arabic/arabic-700.css";
import "./globals.css";
import { dirOf } from "@/i18n/config";
import { getLocale, getT } from "@/i18n/server";
import { Providers } from "./providers";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: { default: "Flowline", template: "%s · Flowline" },
    description: t("meta.description"),
  };
}

export const viewport: Viewport = {
  themeColor: "#09090b",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} dir={dirOf(locale)}>
      <body className="min-h-dvh bg-app text-hi antialiased">
        <Providers locale={locale}>{children}</Providers>
      </body>
    </html>
  );
}
