import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getSessionCookieName, verifySession } from "@/lib/session.server";
import { ProviderButton } from "@/components/provider-button";
import { MrMailerLogo } from "@/components/mr-mailer-logo";

type LoginPageProps = {
  searchParams: Promise<{ error?: string }>;
};

/**
 * Both providers redirect back with an `error` code when they refuse a request,
 * and the OAuth callbacks forward that code verbatim. Mapping them here turns a
 * silent bounce into something actionable — the console-side causes below are
 * the ones that actually bite during local development.
 */
const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  invalid_state: "Sign-in could not be verified. Please try again.",
  oauth_failed: "Sign-in failed. Please try again.",

  // Consent / account level
  access_denied:
    "Access was denied. If this account is a personal Gmail, add it as a test user on the OAuth consent screen (up to 100 accounts are allowed).",
  consent_required: "Consent is required. Please try signing in again.",
  interaction_required: "Extra sign-in steps are required. Please try again.",
  login_required: "Please sign in again to continue.",

  // Client configuration level
  redirect_uri_mismatch:
    "The redirect URI is not registered on this OAuth client. Add http://localhost:3000/auth/google/callback (or the microsoft equivalent) under Authorized redirect URIs, then try again.",
  unauthorized_client:
    "This OAuth client is not authorized for the request. Check that the client type and consent screen are configured.",
  invalid_scope:
    "The requested permissions are not available for this client. Check the scopes enabled on the OAuth client and the consent screen.",

  // Transient
  server_error: "The provider returned a server error. Please try again.",
  temporarily_unavailable:
    "The provider is temporarily unavailable. Please try again.",
};

function describeError(error: string | undefined): string | null {
  if (!error) return null;
  // Never echo the raw code for anything unrecognised — an unknown value is
  // either a provider string we have not mapped or something unexpected, and
  // neither should be rendered as-is into the page.
  return (
    OAUTH_ERROR_MESSAGES[error] ??
    "Sign-in could not be completed. Please try again."
  );
}

export default async function Login({ searchParams }: LoginPageProps) {
  const { error } = await searchParams;

  const session = await (async () => {
    const store = await cookies();
    const token = store.get(getSessionCookieName())?.value;
    return token ? verifySession(token) : null;
  })();

  if (session?.userId) redirect("/dashboard");

  const errorMessage = describeError(error);

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
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background:
            "radial-gradient(ellipse at 12% 0%, rgba(31,58,95,0.16) 0%, transparent 45%), radial-gradient(ellipse at 95% 20%, rgba(192,138,46,0.12) 0%, transparent 45%), radial-gradient(ellipse at 50% 115%, rgba(59,93,140,0.14) 0%, transparent 50%)",
        }}
      />

      <header
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          padding: "18px 24px",
          background: "var(--color-surface)",
          borderBottom: "1px solid var(--color-line)",
        }}
      >
        <MrMailerLogo size={34} />
        <span
          style={{
            fontSize: "12px",
            fontFamily: "var(--font-mono)",
            color: "var(--color-ink-faint)",
          }}
        >
          {new Date().toLocaleDateString("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric",
          })}
        </span>
      </header>

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
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "11px",
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "var(--color-brand-gold)",
          }}
        >
          Inbox, organized
        </span>

        <h1
          style={{
            marginTop: "14px",
            fontFamily: "var(--font-display)",
            fontWeight: 600,
            fontSize: "clamp(32px, 5vw, 46px)",
            lineHeight: 1.12,
            color: "var(--color-ink)",
            letterSpacing: "-0.02em",
            maxWidth: "560px",
          }}
        >
          Your work, intelligently organized.
        </h1>

        <div
          aria-hidden
          style={{
            marginTop: "20px",
            height: "3px",
            width: "56px",
            borderRadius: "999px",
            background: "var(--color-brand-gold)",
          }}
        />

        <p
          style={{
            marginTop: "20px",
            fontSize: "16px",
            lineHeight: 1.6,
            color: "var(--color-ink-soft)",
            fontFamily: "var(--font-body)",
            maxWidth: "440px",
          }}
        >
          Mr Mailer turns your inbox into a clear plan — surfacing what needs a
          reply, what&apos;s worth a glance, and what&apos;s just FYI. Each
          morning, on your terms.
        </p>
      </main>

      <section
        style={{
          position: "relative",
          width: "100%",
          maxWidth: "420px",
          margin: "0 auto",
          padding: "0 20px 48px",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "14px",
            padding: "24px",
            borderRadius: "18px",
            background: "var(--color-surface)",
            border: "1px solid var(--color-line)",
            boxShadow: "0 12px 32px rgba(10, 20, 35, 0.07)",
          }}
        >
          <ProviderButton
            href="/auth/google/login"
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
            href="/auth/microsoft/login"
            icon={
              <svg viewBox="0 0 24 24" width="20" height="20">
                <rect x="2" y="2" width="9.5" height="9.5" fill="#F25022" />
                <rect x="12.5" y="2" width="9.5" height="9.5" fill="#7FBA00" />
                <rect x="2" y="12.5" width="9.5" height="9.5" fill="#00A4EF" />
                <rect
                  x="12.5"
                  y="12.5"
                  width="9.5"
                  height="9.5"
                  fill="#FFB900"
                />
              </svg>
            }
          >
            Continue with Microsoft
          </ProviderButton>

          {errorMessage && (
            <p
              role="alert"
              style={{
                fontSize: "13px",
                lineHeight: 1.5,
                textAlign: "center",
                color: "var(--color-priority-high-text)",
                fontFamily: "var(--font-body)",
              }}
            >
              {errorMessage}
            </p>
          )}
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
