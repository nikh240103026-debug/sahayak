import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/demo-portal/session";

export default async function Acknowledgement({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const s = await getSession();
  if (!s) redirect("/demo-portal/login?expired=1&next=/demo-portal/home");
  const tid = s.state.lastTrackingId;
  if (!tid || sp.tid !== tid) redirect("/demo-portal/home");
  return (
    <>
      <h1>Acknowledgement</h1>
      {sp.duplicate === "1" && (
        <div className="info" role="status">
          This application was already submitted earlier. No new application was created.
        </div>
      )}
      <div className="ok" role="status">
        Your application has been submitted successfully.
        <br />
        Application / Tracking ID: <span className="tracking" id="tracking_id">{tid}</span>
      </div>
      <p>
        Please note this ID to check your status later. Status: <strong>Submitted - under verification</strong>.
      </p>
      <p>This is a fictional demo portal. No real authority will process this application.</p>
      <div className="actions">
        <Link className="btn" href="/demo-portal/status">
          Check Application Status
        </Link>
      </div>
    </>
  );
}
