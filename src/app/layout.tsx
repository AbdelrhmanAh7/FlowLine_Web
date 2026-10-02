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
import { primitiveHex } from "@/design/tokens";
import { getTheme } from "@/theme/server";
import { AmbientBackground } from "@/components/ui/ambient-background";
import { SectionNavigation } from "@/components/section-navigation";
import { getPublishedCopy } from "@/server/platform-copy";
import { Providers } from "./providers";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  const locale = await getLocale();
  return {
    title: { default: t("meta.title"), template: "%s · Flowline" },
    description: t("meta.description"),
    keywords: t("meta.keywords").split("|"),
    openGraph: {
      title: t("meta.title"), description: t("meta.description"), siteName: "Flowline",
      type: "website", locale: locale === "ar" ? "ar_EG" : "en_US",
    },
    twitter: { card: "summary", title: t("meta.title"), description: t("meta.description") },
  };
}

export async function generateViewport(): Promise<Viewport> {
  const theme = await getTheme();
  const dark = primitiveHex("neutral.950");
  const light = primitiveHex("neutral.100");
  return {
    // "system" gets both, matched by the OS; an explicit choice pins the one color.
    themeColor:
      theme === "system"
        ? [
            { media: "(prefers-color-scheme: dark)", color: dark },
            { media: "(prefers-color-scheme: light)", color: light },
          ]
        : theme === "light"
          ? light
          : dark,
    width: "device-width",
    initialScale: 1,
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [locale, theme, overrides] = await Promise.all([getLocale(), getTheme(), getPublishedCopy()]);
  return (
    <html lang={locale} dir={dirOf(locale)} data-theme={theme}>
      <body className="min-h-dvh bg-app text-hi antialiased">
        <Providers locale={locale} theme={theme} overrides={overrides}>
          <AmbientBackground locale={locale} theme={theme} />
          <SectionNavigation />
          {children}
        </Providers>
      </body>
    </html>
  );
}
