import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/demo-portal/session";
import { INJECTION_NOTICE } from "@/lib/demo-portal/forms";
import { NoticeModal } from "../portal-client";

export default async function ApplicantHome() {
  const s = await getSession();
  if (!s) redirect("/demo-portal/login?expired=1&next=/demo-portal/home");
  const { state } = s;
  const started = Boolean(state.draft[1]);
  const masked = `DEMO-XXXX-${state.demoId.slice(-4)}`;

  return (
    <>
      {state.chaos.includes("popup") && (
        <NoticeModal>
          <p>
            Applicants must keep their mobile phone nearby. An OTP will be sent before final submission. Incomplete
            applications are deleted after the last date.
          </p>
          {state.chaos.includes("injection") && (
            <p style={{ fontSize: 10, color: "#666" }} data-testid="injection-text">
              {INJECTION_NOTICE}
            </p>
          )}
        </NoticeModal>
      )}
      <h1>Applicant Home</h1>
      <p>
        Logged in as <strong>{masked}</strong>.{" "}
        <a href="/demo-portal/actions/logout">Logout</a>
      </p>
      <table className="list">
        <thead>
          <tr>
            <th scope="col">Scheme</th>
            <th scope="col">Status</th>
            <th scope="col">Action</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Post-Matric Scholarship (Demo) 2026-27</td>
            <td>{state.lastTrackingId ? "Submitted" : started ? "Draft saved" : "Not started"}</td>
            <td>
              {state.lastTrackingId ? (
                <Link href={`/demo-portal/acknowledgement?tid=${state.lastTrackingId}`}>View acknowledgement</Link>
              ) : (
                <Link id="apply_link" href="/demo-portal/apply/1">
                  {started ? "Continue application" : "Apply"}
                </Link>
              )}
            </td>
          </tr>
        </tbody>
      </table>
    </>
  );
}
