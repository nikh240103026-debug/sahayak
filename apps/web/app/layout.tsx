import type { Metadata, Viewport } from "next";
import { DM_Sans, Fraunces, JetBrains_Mono, Noto_Sans_Devanagari } from "next/font/google";
import { cookies, headers } from "next/headers";
import { getLocale } from "next-intl/server";
import { brand } from "@app/shared/brand";
import "./globals.css";

// next/font downloads these at build time and serves them from this site: no requests to Google at runtime.
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", display: "swap" });
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });
const devanagari = Noto_Sans_Devanagari({
  subsets: ["devanagari"],
  weight: ["400", "600"],
  variable: "--font-devanagari",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: `${brand.name} · ${brand.tagline.en}`, template: `%s · ${brand.name}` },
  description: `${brand.tagline.en} ${brand.notAffiliated.en}`,
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FAF6EE" },
    { media: "(prefers-color-scheme: dark)", color: "#14191F" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Reading headers makes every page dynamic, which the per-request CSP nonce requires.
  await headers();
  const locale = await getLocale();
  const themeCookie = (await cookies()).get("theme")?.value;
  const theme = themeCookie === "light" || themeCookie === "dark" ? themeCookie : "system";
  return (
    <html
      lang={locale}
      data-theme={theme}
      className={`${fraunces.variable} ${dmSans.variable} ${mono.variable} ${devanagari.variable}`}
    >
      <body className="paper-grain antialiased">{children}</body>
    </html>
  );
}
