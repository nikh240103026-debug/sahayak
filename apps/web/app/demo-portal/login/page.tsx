import { hasTrustedCookie, makeCaptcha } from "@/lib/demo-portal/session";

const ERRORS: Record<string, string> = {
  id: "Demo ID: Enter your Demo ID in the form DEMO-1234-5678.",
  dob: "Date of Birth: Enter the date exactly as DD/MM/YYYY.",
  captcha: "CAPTCHA: The answer was not correct. Please try again.",
};

function safePortalPath(raw: string | undefined): string {
  return raw && /^\/demo-portal\/[a-z0-9/_-]*$/i.test(raw) ? raw : "/demo-portal/home";
}

export default async function PortalLogin({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const next = safePortalPath(sp.next);
  const showCaptcha = sp.captcha === "1" || !(await hasTrustedCookie());
  const captcha = showCaptcha ? makeCaptcha() : null;
  const error = sp.error ? ERRORS[sp.error] : undefined;

  return (
    <>
      <h1>Applicant Login</h1>
      {sp.expired === "1" && (
        <div className="info" role="status">
          Your session has expired for security reasons. Please log in again to continue your application.
        </div>
      )}
      {error && (
        <div className="error-summary" role="alert">
          <strong>Please correct the following:</strong>
          <ul>
            <li>{error}</li>
          </ul>
        </div>
      )}
      <form method="post" action="/demo-portal/actions/login" autoComplete="off">
        <input type="hidden" name="next" value={next} />
        <input type="hidden" name="chaos" value={sp.chaos ?? ""} />
        {captcha && <input type="hidden" name="captcha_token" value={captcha.token} />}
        <table className="form">
          <tbody>
            <tr>
              <td className="l">
                <label htmlFor="demo_id">
                  Demo ID (Applicant ID) <span className="req">*</span>
                </label>
              </td>
              <td>
                <input id="demo_id" name="demo_id" type="text" maxLength={14} required placeholder="DEMO-1234-5678" />
              </td>
            </tr>
            <tr>
              <td className="l">
                <label htmlFor="login_dob">
                  Date of Birth (DD/MM/YYYY) <span className="req">*</span>
                </label>
              </td>
              <td>
                <input id="login_dob" name="login_dob" type="text" maxLength={10} required inputMode="numeric" />
              </td>
            </tr>
            {captcha && (
              <tr>
                <td className="l">
                  <label htmlFor="captcha_answer">
                    Answer the question above <span className="req">*</span>
                  </label>
                </td>
                <td>
                  <div className="captcha" id="captcha_question">
                    {captcha.question}
                  </div>
                  <input id="captcha_answer" name="captcha_answer" type="text" maxLength={3} required inputMode="numeric" />
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="actions">
          <button id="login_btn" type="submit" className="btn primary">
            Login
          </button>
        </div>
      </form>
      <p style={{ marginTop: 10 }}>
        This practice portal accepts any Demo ID in the format DEMO-1234-5678. Never enter an Aadhaar number here.
      </p>
    </>
  );
}
