import Link from "next/link";
import { LegalFooter } from "@/components/legal-footer";

/**
 * Shell for the pages that must be readable without an account: /privacy,
 * /terms, /data-deletion and /account-deleted.
 *
 * `(legal)` is a route group, so it changes nothing about those URLs — it only
 * exists so four pages can share one wrapper instead of copying the markup.
 *
 * Deliberately reads only theme tokens and never `requireUser()`: none of these
 * routes appear in the middleware matcher, and a privacy policy that redirects
 * to a login screen is not a privacy policy.
 */
export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--color-paper)",
        padding: "40px 20px",
      }}
    >
      <div
        className="legal-shell"
        style={{
          width: "100%",
          maxWidth: "44rem",
          background: "var(--color-card)",
          border: "1px solid var(--color-line)",
          borderRadius: "10px",
          padding: "clamp(24px, 5vw, 44px)",
        }}
      >
        {children}

        <footer
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            marginTop: "40px",
            paddingTop: "20px",
            borderTop: "1px solid var(--color-line)",
          }}
        >
          <Link
            href="/"
            className="btn btn-link text-xs"
            style={{ fontFamily: "var(--font-body)" }}
          >
            ← Mr Mailer
          </Link>
          <LegalFooter />
        </footer>
      </div>
    </div>
  );
}
