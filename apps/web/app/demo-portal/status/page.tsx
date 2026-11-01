import { hmacHex } from "@/lib/demo-portal/session";
import { safeEqual } from "@app/shared/crypto";

/** Request-time clock check (server component, runs once per request). */
function notExpired(expiresAtMs: number): boolean {
  return expiresAtMs > Date.now();
}

export default async function StatusPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  // The POST handler redirects here with a signed result, so no date of birth ever appears in the URL.
  let result: { tid: string; status: string } | "notfound" | null = null;
  if (sp.r === "notfound") result = "notfound";
  else if (sp.tid && sp.st && sp.sig && sp.exp && notExpired(Number(sp.exp))) {
    const expected = hmacHex("status", `${sp.tid}|${sp.st}|${sp.exp}`);
    if (safeEqual(expected, sp.sig)) result = { tid: sp.tid, status: sp.st };
  }

  return (
    <>
      <h1>Check Application Status</h1>
      {result === "notfound" && (
        <div className="error-summary" role="alert">
          No application matches this Tracking ID and date of birth.
        </div>
      )}
      {result && result !== "notfound" && (
        <div className="ok" role="status" id="status_result">
          Tracking ID <span className="tracking">{result.tid}</span>: {result.status}
        </div>
      )}
      <form method="post" action="/demo-portal/actions/status" autoComplete="off">
        <table className="form">
          <tbody>
            <tr>
              <td className="l">
                <label htmlFor="tracking">Tracking ID</label>
              </td>
              <td>
                <input id="tracking" name="tracking" type="text" maxLength={24} required placeholder="DEMO-SCH-2026-00042" />
              </td>
            </tr>
            <tr>
              <td className="l">
                <label htmlFor="status_dob">Date of Birth (DD/MM/YYYY)</label>
              </td>
              <td>
                <input id="status_dob" name="dob" type="text" maxLength={10} required inputMode="numeric" />
              </td>
            </tr>
          </tbody>
        </table>
        <div className="actions">
          <button type="submit" className="btn primary">
            Check Status
          </button>
        </div>
      </form>
    </>
  );
}
