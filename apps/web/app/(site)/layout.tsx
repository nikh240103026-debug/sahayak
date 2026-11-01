import { NextIntlClientProvider } from "next-intl";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider>
      <SiteHeader />
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-6xl px-4 py-8 outline-none sm:px-6 sm:py-12">
        {children}
      </main>
      <SiteFooter />
    </NextIntlClientProvider>
  );
}
