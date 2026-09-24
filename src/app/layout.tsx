import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";

import { ThemeProvider } from "@/components/theme/theme-provider";

import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app");

  return {
    title: {
      default: `${t("name")} — ${t("tagline")}`,
      template: `%s · ${t("name")}`,
    },
    description: t("tagline"),
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfaf8" },
    { media: "(prefers-color-scheme: dark)", color: "#101218" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();

  return (
    // suppressHydrationWarning is required because next-themes sets the theme
    // class on <html> before React hydrates, to avoid a flash of the wrong theme.
    <html
      lang={locale}
      className={`${GeistSans.variable} ${GeistMono.variable} h-full`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        <NextIntlClientProvider>
          <ThemeProvider>{children}</ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
