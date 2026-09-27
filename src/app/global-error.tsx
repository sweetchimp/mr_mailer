"use client";

/**
 * Catches failures in the root layout itself, so it has to render its own
 * <html>/<body> and cannot rely on globals.css being applied.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#F7F9FC",
          color: "#0B1B3D",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, sans-serif",
        }}
      >
        <div style={{ padding: "2rem", maxWidth: "36rem" }}>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 600, margin: 0 }}>
            Mr Mailer could not start
          </h1>
          <p style={{ marginTop: "0.75rem", lineHeight: 1.6, opacity: 0.8 }}>
            A critical error stopped the page from rendering. Trying again
            usually clears it.
          </p>
          {error.digest ? (
            <p style={{ marginTop: "1rem", fontSize: "0.8rem", opacity: 0.6 }}>
              Reference: {error.digest}
            </p>
          ) : null}
          <button
            onClick={reset}
            style={{
              marginTop: "1.5rem",
              padding: "10px 20px",
              borderRadius: "10px",
              border: "none",
              background: "#155EEF",
              color: "#fff",
              fontSize: "0.9rem",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
