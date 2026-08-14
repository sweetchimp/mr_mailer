import { Form, redirect } from "react-router";
import { getSession } from "../lib/auth.server";
import type { Route } from "./+types/login";

export async function loader({ request }: Route.LoaderArgs) {
  const session = await getSession(request.headers.get("Cookie"));
  if (session.get("userId")) {
    return redirect("/dashboard");
  }
  return null;
}

function ProviderButton({
  action,
  children,
  icon,
}: {
  action: string;
  children: React.ReactNode;
  icon: React.ReactNode;
}) {
  return (
    <Form method="post" action={action} style={{ width: "100%" }}>
      <button
        type="submit"
        className="btn w-full"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "13px 20px",
          background: "var(--color-card)",
          border: "1px solid var(--color-line)",
          borderRadius: "10px",
          color: "var(--color-ink)",
          fontSize: "15px",
          fontWeight: 500,
          cursor: "pointer",
          transition: "all 0.2s ease",
          fontFamily: "var(--font-body)",
          boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
        }}
      >
        <span style={{ display: "inline-flex", marginRight: "10px" }}>{icon}</span>
        {children}
      </button>
    </Form>
  );
}

export default function Login() {
  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        background: "var(--color-bg)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Ambient glows */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background:
            "radial-gradient(ellipse at 15% 0%, rgba(21,94,239,0.10) 0%, transparent 45%), radial-gradient(ellipse at 95% 25%, rgba(109,93,251,0.12) 0%, transparent 45%), radial-gradient(ellipse at 50% 110%, rgba(34,211,238,0.10) 0%, transparent 50%)",
        }}
      />

      {/* Top bar */}
      <header
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "18px 24px",
          background: "var(--color-surface)",
          borderBottom: "1px solid var(--color-line)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <img src="/logo.png" alt="Mr Mailer logo" width={36} height={36} style={{ display: "block", objectFit: "contain" }} />
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 600,
              fontSize: "22px",
              color: "var(--color-ink)",
              letterSpacing: "-0.02em",
            }}
          >
            Mr Mailer
          </span>
        </div>
        <span
          style={{
            fontSize: "12px",
            fontFamily: "var(--font-mono)",
            color: "var(--color-ink-faint)",
          }}
        >
          {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
        </span>
      </header>

      {/* Hero */}
      <main
        style={{
          position: "relative",
          flex: "1",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "48px 20px 24px",
          textAlign: "center",
        }}
      >
        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 600,
            fontSize: "clamp(30px, 5vw, 44px)",
            lineHeight: 1.15,
            color: "var(--color-ink)",
            letterSpacing: "-0.02em",
            maxWidth: "560px",
          }}
        >
          Your work, intelligently organized.
        </h1>
        <p
          style={{
            marginTop: "16px",
            fontSize: "16px",
            lineHeight: 1.6,
            color: "var(--color-ink-soft)",
            fontFamily: "var(--font-body)",
            maxWidth: "440px",
          }}
        >
          Mr Mailer turns your inbox into a clear plan — surfacing what needs a reply, what&apos;s
          worth a glance, and what&apos;s just FYI. Each morning, on your terms.
        </p>
      </main>

      {/* Sign-in options pinned toward the bottom */}
      <section
        style={{
          position: "relative",
          width: "100%",
          maxWidth: "420px",
          margin: "0 auto",
          padding: "0 20px 48px",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <ProviderButton
            action="/auth/google/login"
            icon={
              <svg viewBox="0 0 24 24" width="20" height="20">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
            }
          >
            Continue with Google
          </ProviderButton>

          <ProviderButton
            action="/auth/microsoft/login"
            icon={
              <svg viewBox="0 0 24 24" width="20" height="20">
                <rect x="2" y="2" width="9.5" height="9.5" fill="#F25022" />
                <rect x="12.5" y="2" width="9.5" height="9.5" fill="#7FBA00" />
                <rect x="2" y="12.5" width="9.5" height="9.5" fill="#00A4EF" />
                <rect x="12.5" y="12.5" width="9.5" height="9.5" fill="#FFB900" />
              </svg>
            }
          >
            Continue with Microsoft
          </ProviderButton>
        </div>

        <p
          style={{
            marginTop: "28px",
            fontSize: "12px",
            lineHeight: 1.6,
            textAlign: "center",
            color: "var(--color-ink-faint)",
            fontFamily: "var(--font-body)",
          }}
        >
          Mr Mailer summarizes your mail and drafts replies with AI.
          <br />
          You review and approve everything before it&apos;s sent.
        </p>
      </section>
    </div>
  );
}
