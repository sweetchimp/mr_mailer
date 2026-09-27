"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const details =
    process.env.NODE_ENV === "development" && error.message
      ? error.message
      : "An unexpected error occurred.";

  return (
    <div
      style={{
        padding: "4rem 1rem 1rem",
        maxWidth: "36rem",
        margin: "0 auto",
        fontFamily: "var(--font-body)",
      }}
    >
      <h1
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "2rem",
          fontWeight: 500,
          color: "var(--color-ink)",
        }}
      >
        Something went wrong
      </h1>
      <pre
        style={{
          marginTop: "1rem",
          padding: "1rem",
          whiteSpace: "pre-wrap",
          background: "var(--color-card)",
          border: "1px solid var(--color-line)",
          borderRadius: "8px",
          color: "var(--color-ink-soft)",
          fontSize: "0.875rem",
        }}
      >
        {details}
        {error.digest ? `\n\nDigest: ${error.digest}` : null}
      </pre>
      <button
        onClick={reset}
        className="btn btn-primary mt-6 px-5 py-2.5 text-sm"
      >
        Try again
      </button>
    </div>
  );
}
