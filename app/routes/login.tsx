import { Form, redirect } from "react-router";
import { getSession } from "../lib/auth.server";
import { MailmanScene } from "../components/MailmanScene";
import type { Route } from "./+types/login";

// Load Three.js from CDN (preloaded for performance)
export const links: Route.LinksFunction = () => [
  {
    rel: "preload",
    as: "script",
    href: "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js",
    crossOrigin: "anonymous",
  },
];

export async function loader({ request }: Route.LoaderArgs) {
  const session = await getSession(request.headers.get("Cookie"));
  if (session.get("userId")) {
    return redirect("/dashboard");
  }
  return null;
}

const LETTERS = ["M", "r", " ", "M", "a", "i", "l", "e", "r"];
const LETTER_DELAYS = [0.8, 1.0, 1.15, 1.3, 1.45, 1.6, 1.75, 1.9, 2.05];

export default function Login() {
  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <MailmanScene />

      <div
        style={{
          position: "relative",
          zIndex: 10,
          textAlign: "center",
          maxWidth: "600px",
          width: "90%",
        }}
      >
        <div
          style={{
            height: "80px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "2px",
            marginBottom: "20px",
          }}
        >
          {LETTERS.map((char, i) => (
            <span
              key={i}
              className="letter-animate"
              style={{
                fontSize: "48px",
                fontWeight: 300,
                color: "var(--color-ink)",
                fontFamily: "'Georgia', 'Garamond', serif",
                opacity: 0,
                animation: `letterDeliver 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards`,
                animationDelay: `${LETTER_DELAYS[i]}s`,
                marginLeft: i === 2 ? "8px" : undefined,
              }}
            >
              {char}
            </span>
          ))}
        </div>

        <div
          className="content-animate"
          style={{
            opacity: 0,
            animation: "contentFade 0.8s ease-out 2.5s forwards",
          }}
        >
          <p
            style={{
              fontSize: "16px",
              color: "var(--color-ink-soft)",
              fontWeight: 400,
              marginBottom: "48px",
              letterSpacing: "0.3px",
            }}
          >
            Your morning intelligence, simplified
          </p>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "16px",
              marginBottom: "32px",
            }}
          >
            <Form method="post" action="/auth/google/login" style={{ width: "100%" }}>
              <button
                type="submit"
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "14px 20px",
                  background: "color-mix(in srgb, var(--color-taupe) 8%, transparent)",
                  border: "1px solid color-mix(in srgb, var(--color-taupe) 25%, transparent)",
                  borderRadius: "8px",
                  color: "var(--color-taupe)",
                  fontSize: "15px",
                  fontWeight: 500,
                  cursor: "pointer",
                  transition: "all 0.3s ease",
                  fontFamily: "inherit",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "color-mix(in srgb, var(--color-taupe) 12%, transparent)";
                  e.currentTarget.style.borderColor = "color-mix(in srgb, var(--color-taupe) 40%, transparent)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "color-mix(in srgb, var(--color-taupe) 8%, transparent)";
                  e.currentTarget.style.borderColor = "color-mix(in srgb, var(--color-taupe) 25%, transparent)";
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="20"
                  height="20"
                  style={{ marginRight: "10px" }}
                >
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
                Sign in with Google
              </button>
            </Form>
          </div>

          <p
            style={{
              fontSize: "13px",
              color: "var(--color-ink-faint)",
              letterSpacing: "0.2px",
            }}
          >
            No signup needed. Just your Gmail.
          </p>
        </div>
      </div>
    </div>
  );
}
