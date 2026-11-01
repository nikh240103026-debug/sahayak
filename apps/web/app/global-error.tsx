"use client";

/** Last-resort error page (rendered without the normal layout, so it carries its own minimal markup). */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#FAF6EE", color: "#1E2A32", padding: "48px 16px" }}>
        <main style={{ maxWidth: 560, margin: "0 auto", textAlign: "center" }}>
          <h1>Something went wrong</h1>
          <p>It is not you, it is us. Please try again. If it keeps happening, tell us on the Grievances page.</p>
          <p lang="hi">कुछ गड़बड़ हो गई। कृपया फिर से कोशिश करें।</p>
          <button
            type="button"
            onClick={reset}
            style={{ minHeight: 44, padding: "8px 20px", borderRadius: 12, border: 0, background: "#0F6B6E", color: "#fff", fontWeight: 600 }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
