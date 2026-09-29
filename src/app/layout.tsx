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
import { Providers } from "./providers";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: { default: "Flowline", template: "%s · Flowline" },
    description: t("meta.description"),
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
  const [locale, theme] = await Promise.all([getLocale(), getTheme()]);
  return (
    <html lang={locale} dir={dirOf(locale)} data-theme={theme}>
      <body className="min-h-dvh bg-app text-hi antialiased">
        <Providers locale={locale}>{children}</Providers>
      </body>
    </html>
  );
}
