import { notFound, redirect } from "next/navigation";
import { DEMO_STATES } from "@app/shared/demo-portal";
import { getSession, type PortalState } from "@/lib/demo-portal/session";
import { STEP_FIELDS, STEP_TITLES, type PortalField } from "@/lib/demo-portal/forms";
import { DependentSelects } from "../../portal-client";

/** Request-time clock check (server component, runs once per request). */
function notExpired(expiresAtMs: number): boolean {
  return expiresAtMs > Date.now();
}

function firstIncomplete(state: PortalState): number {
  for (const s of [1, 2, 3, 4] as const) if (!state.draft[s]) return s;
  if (!state.draft[5]) return 5;
  if (!state.draft.otpVerified) return 6;
  return 7;
}

function Errors({ errors }: { errors: string[] }) {
  if (!errors.length) return null;
  return (
    <div className="error-summary" role="alert">
      <strong>Please correct the following:</strong>
      <ul>
        {errors.map((e) => (
          <li key={e}>{e}</li>
        ))}
      </ul>
    </div>
  );
}

function FieldRow({ f, value }: { f: PortalField; value: string }) {
  return (
    <tr>
      <td className="l">
        <label htmlFor={f.name}>
          {f.label}
          {f.hint ? ` (${f.hint})` : ""} {!f.optional && <span className="req">*</span>}
        </label>
      </td>
      <td>
        {f.kind === "select" ? (
          <select id={f.name} name={f.name} defaultValue={value} required={!f.optional}>
            <option value="">-- Select --</option>
            {f.options!.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        ) : (
          <input
            id={f.name}
            name={f.name}
            type="text"
            defaultValue={value}
            maxLength={f.maxLength}
            inputMode={f.inputMode}
            autoComplete="off"
          />
        )}
      </td>
    </tr>
  );
}

function Progress({ step, state }: { step: number; state: PortalState }) {
  const done = (n: number) => (n <= 4 ? Boolean(state.draft[n as 1]) : n === 5 ? Boolean(state.draft[5]) : n === 6 ? Boolean(state.draft.otpVerified) : false);
  return (
    <div className="steps" aria-label="Application steps">
      {[1, 2, 3, 4, 5, 6, 7].map((n) => (
        <span key={n} className={n === step ? "on" : done(n) ? "done" : ""} aria-current={n === step ? "step" : undefined}>
          {n}. {STEP_TITLES[n]}
        </span>
      ))}
    </div>
  );
}

const PREVIEW_LABELS: Record<string, string> = {
  applicant_name: "Applicant Name",
  father_name: "Father's / Guardian's Name",
  dob: "Date of Birth",
  gender: "Gender",
  category: "Category",
  mobile: "Mobile Number",
  email: "Email Address",
  remarks: "Remarks",
  state: "State",
  district: "District",
  institution: "Institution",
  course: "Course Name",
  year_of_study: "Year of Study",
  previous_exam: "Last Qualifying Examination",
  board: "Board / University",
  passing_year: "Year of Passing",
  percentage: "Percentage of Marks",
  annual_income: "Annual Family Income",
  income_cert_no: "Income Certificate Number",
  acc_holder: "Account Holder Name",
  acc_number: "Bank Account Number",
  ifsc: "IFSC Code",
};

export default async function ApplyStep({
  params,
  searchParams,
}: {
  params: Promise<{ step: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { step: raw } = await params;
  const sp = await searchParams;
  const step = Number(raw);
  if (!Number.isInteger(step) || step < 1 || step > 7) notFound();
  const s = await getSession();
  if (!s) redirect(`/demo-portal/login?expired=1&next=/demo-portal/apply/${step}`);
  const { state } = s;
  const allowed = firstIncomplete(state);
  if (step > allowed) redirect(`/demo-portal/apply/${allowed}`);

  const flash = state.flash?.step === step ? state.flash : undefined;
  const errors = flash?.errors ?? [];

  if (step <= 4) {
    const values = flash?.values ?? state.draft[step as 1] ?? {};
    const fields = STEP_FIELDS[step as 1];
    return (
      <>
        <h1>{STEP_TITLES[step]}</h1>
        <Progress step={step} state={state} />
        <Errors errors={errors} />
        <form method="post" action={`/demo-portal/actions/apply/${step}`} autoComplete="off">
          <table className="form">
            <tbody>
              {step === 2 ? (
                <>
                  <DependentSelects
                    states={DEMO_STATES.map((x) => ({ code: x.code, name: x.name }))}
                    initial={{ state: values.state, district: values.district, institution: values.institution }}
                  />
                  {fields
                    .filter((f) => f.kind !== "select-dynamic" && f.name !== "state")
                    .map((f) => (
                      <FieldRow key={f.name} f={f} value={values[f.name] ?? ""} />
                    ))}
                </>
              ) : (
                fields.map((f) => <FieldRow key={f.name} f={f} value={values[f.name] ?? ""} />)
              )}
            </tbody>
          </table>
          <div className="actions">
            <button id="save_next" type="submit" className="btn primary">
              Save &amp; Next
            </button>
          </div>
        </form>
      </>
    );
  }

  if (step === 5) {
    return (
      <>
        <h1>{STEP_TITLES[5]}</h1>
        <Progress step={5} state={state} />
        <Errors errors={errors} />
        <p>Allowed formats: PDF, JPG, PNG. Maximum size 2 MB per file.</p>
        <form method="post" action="/demo-portal/actions/apply/5" encType="multipart/form-data">
          <table className="form">
            <tbody>
              <tr>
                <td className="l">
                  <label htmlFor="marksheet_file">
                    Upload Marksheet (PDF/JPG/PNG, max 2 MB) <span className="req">*</span>
                  </label>
                </td>
                <td>
                  <input id="marksheet_file" name="marksheet_file" type="file" accept=".pdf,.jpg,.jpeg,.png" required />
                </td>
              </tr>
              <tr>
                <td className="l">
                  <label htmlFor="income_file">
                    Upload Income Certificate (PDF/JPG/PNG, max 2 MB) <span className="req">*</span>
                  </label>
                </td>
                <td>
                  <input id="income_file" name="income_file" type="file" accept=".pdf,.jpg,.jpeg,.png" required />
                </td>
              </tr>
            </tbody>
          </table>
          <div className="actions">
            <button id="upload_next" type="submit" className="btn primary">
              Upload &amp; Next
            </button>
          </div>
        </form>
      </>
    );
  }

  if (step === 6) {
    const mobile = state.draft[1]?.mobile ?? "";
    const sent = Boolean(state.otp && notExpired(state.otp.exp));
    return (
      <>
        <h1>{STEP_TITLES[6]}</h1>
        <Progress step={6} state={state} />
        <Errors errors={errors} />
        {!sent ? (
          <form method="post" action="/demo-portal/actions/otp/send">
            <p>We will send a one-time password (OTP) to your registered mobile number ending with {mobile.slice(-2)}.</p>
            <div className="actions">
              <button id="send_otp" type="submit" className="btn primary">
                Send OTP
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="info" id="otp_message" role="status">
              An OTP has been sent to your mobile number ending with {state.otp!.last2}. It is valid for 10 minutes. Do not
              share it with anyone.
              {sp.resent === "1" ? " A new OTP was sent." : ""}
            </div>
            <form method="post" action="/demo-portal/actions/otp/verify" autoComplete="off">
              <table className="form">
                <tbody>
                  <tr>
                    <td className="l">
                      <label htmlFor="otp">
                        Enter OTP <span className="req">*</span>
                      </label>
                    </td>
                    <td>
                      <input id="otp" name="otp" type="text" maxLength={6} inputMode="numeric" required autoComplete="one-time-code" />
                    </td>
                  </tr>
                </tbody>
              </table>
              <div className="actions">
                <button id="verify_otp" type="submit" className="btn primary">
                  Verify OTP
                </button>
              </div>
            </form>
            <form method="post" action="/demo-portal/actions/otp/send">
              <input type="hidden" name="resend" value="1" />
              <button type="submit" className="btn">
                Resend OTP
              </button>
            </form>
          </>
        )}
      </>
    );
  }

  const all: Record<string, string> = { ...state.draft[1], ...state.draft[2], ...state.draft[3], ...state.draft[4] };
  return (
    <>
      <h1>{STEP_TITLES[7]}</h1>
      <Progress step={7} state={state} />
      <Errors errors={errors} />
      <p>Check every detail carefully. You cannot edit the application after final submission.</p>
      <table className="list" id="preview_table">
        <thead>
          <tr>
            <th scope="col">Field</th>
            <th scope="col">Value</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(PREVIEW_LABELS).map(([k, label]) => (
            <tr key={k}>
              <td>{label}</td>
              <td>{all[k] || "-"}</td>
            </tr>
          ))}
          {(state.draft[5]?.uploads ?? []).map((u) => (
            <tr key={u.kind}>
              <td>Document: {u.kind === "marksheet" ? "Marksheet" : "Income Certificate"}</td>
              <td>
                Uploaded ({u.mime}, {Math.ceil(u.size / 1024)} KB)
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form method="post" action="/demo-portal/actions/submit">
        <p>
          <label htmlFor="declaration">
            <input id="declaration" name="declaration" type="checkbox" required /> I hereby declare that the information
            given above is true to the best of my knowledge, and that the documents are my own.
          </label>
        </p>
        <div className="actions">
          <button id="final_submit" type="submit" className="btn primary">
            Final Submit
          </button>
        </div>
      </form>
    </>
  );
}
