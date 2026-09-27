import Link from "next/link";

export default function NotFound() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "16px",
        padding: "32px 20px",
        textAlign: "center",
      }}
    >
      <h1
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "2.5rem",
          fontWeight: 500,
          color: "var(--color-ink)",
        }}
      >
        404
      </h1>
      <p
        style={{
          fontFamily: "var(--font-body)",
          fontSize: "0.95rem",
          color: "var(--color-ink-soft)",
        }}
      >
        The requested page could not be found.
      </p>
      <Link
        href="/dashboard"
        className="btn btn-primary px-5 py-2.5 text-sm"
        style={{ fontFamily: "var(--font-body)" }}
      >
        Back to dashboard
      </Link>
    </div>
  );
}
