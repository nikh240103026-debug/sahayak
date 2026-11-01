import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@app/shared/brand";
import "./portal.css";

export const metadata: Metadata = {
  title: `${brand.demoPortal.en} (fictional)`,
  robots: { index: false, follow: false },
};

export default function DemoPortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="rcdp" lang="en">
      <div className="rcdp-banner" role="note">
        {brand.demoPortal.banner}
      </div>
      <header className="rcdp-header">
        <div>
          <div className="title">{brand.demoPortal.en}</div>
          <div className="sub">
            {brand.demoPortal.hi} · A practice website for trying out form filling. No real office is connected.
          </div>
        </div>
        <div className="sub">Helpdesk (fictional): 1800-000-0000</div>
      </header>
      <nav className="rcdp-nav" aria-label="Portal">
        <Link href="/demo-portal">Home</Link>
        <Link href="/demo-portal/login">Applicant Login</Link>
        <Link href="/demo-portal/status">Check Application Status</Link>
      </nav>
      <main id="portal-main">{children}</main>
      <footer>
        This is a fictional demo portal created for testing and demonstrations. It is not a government website, it is
        not affiliated with any government body, and applications made here are not sent anywhere.
      </footer>
    </div>
  );
}
