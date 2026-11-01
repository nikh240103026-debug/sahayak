import Link from "next/link";

export default function PortalHome() {
  return (
    <>
      <div className="marquee">
        Applications for the Post-Matric Scholarship (Demo) 2026-27 are open. Keep your marksheet and income certificate
        ready before you begin.
      </div>
      <h1>Welcome to the Scholarship Section</h1>
      <p>
        Students studying in participating states can apply for the demo post-matric scholarship online. Log in with
        your Demo ID and date of birth to start or continue your application.
      </p>
      <table className="list">
        <caption className="sr-only">Notices</caption>
        <thead>
          <tr>
            <th scope="col">S.No.</th>
            <th scope="col">Notice</th>
            <th scope="col">Date</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>1</td>
            <td>Last date to submit applications (demo): 31/03/2027</td>
            <td>01/11/2026</td>
          </tr>
          <tr>
            <td>2</td>
            <td>Upload documents only in PDF, JPG or PNG format, maximum 2 MB each.</td>
            <td>01/11/2026</td>
          </tr>
          <tr>
            <td>3</td>
            <td>Sessions end automatically after a few minutes for your security.</td>
            <td>01/11/2026</td>
          </tr>
        </tbody>
      </table>
      <div className="actions">
        <Link className="btn primary" href="/demo-portal/login">
          Applicant Login
        </Link>
        <Link className="btn" href="/demo-portal/status">
          Check Application Status
        </Link>
      </div>
    </>
  );
}
