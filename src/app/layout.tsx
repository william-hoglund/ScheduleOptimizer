import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";

import { ThemeProvider } from "@/components/theme/theme-provider";
import { clientEnv } from "@/lib/env";

import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app");
  const title = { default: `${t("name")} — ${t("tagline")}`, template: `%s · ${t("name")}` };

  return {
    metadataBase: new URL(clientEnv.NEXT_PUBLIC_APP_URL),
    title,
    description: t("tagline"),
    // opengraph-image.tsx / apple-icon.tsx / icon.tsx are picked up
    // automatically by Next's file-based metadata convention — this just
    // adds the fields those files don't cover themselves.
    openGraph: {
      title: title.default,
      description: t("tagline"),
      siteName: t("name"),
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: title.default,
      description: t("tagline"),
    },
  };
}

export const viewport: Viewport = {
  // Matches --background in globals.css for each theme — the browser chrome
  // (mobile address bar, PWA splash) should read as part of the page, not a
  // mismatched sliver above it. Update alongside any change to those tokens.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfaf9" },
    { media: "(prefers-color-scheme: dark)", color: "#1e2129" },
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
