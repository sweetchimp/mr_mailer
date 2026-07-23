import { Form, Link, redirect } from "react-router";
import { getSession, destroySession } from "../lib/auth.server";
import type { Route } from "./+types/auth.logout";

export async function action({ request }: Route.ActionArgs) {
  const session = await getSession(request.headers.get("Cookie"));
  return redirect("/login", {
    headers: {
      "Set-Cookie": await destroySession(session),
    },
  });
}

export default function AuthLogout() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--color-paper)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "24rem",
          padding: "32px",
          background: "var(--color-card)",
          border: "1px solid var(--color-line)",
          borderRadius: "10px",
          textAlign: "center",
        }}
      >
        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 500,
            fontSize: "1.5rem",
            color: "var(--color-ink)",
          }}
        >
          Log out
        </h1>
        <p
          style={{
            fontFamily: "var(--font-body)",
            color: "var(--color-ink-soft)",
            marginTop: "8px",
            fontSize: "0.875rem",
          }}
        >
          Are you sure you want to log out?
        </p>
        <div
          style={{
            display: "flex",
            gap: "12px",
            justifyContent: "center",
            marginTop: "24px",
          }}
        >
          <Form method="post">
            <button
              type="submit"
              style={{
                padding: "10px 20px",
                background: "var(--color-dawn-1)",
                color: "#FFFFFF",
                borderRadius: "10px",
                fontFamily: "var(--font-body)",
                fontWeight: 500,
                fontSize: "0.875rem",
                border: "none",
                cursor: "pointer",
                transition: "opacity 0.15s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.9")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
            >
              Yes, log out
            </button>
          </Form>
          <Link
            to="/dashboard"
            style={{
              padding: "10px 20px",
              background: "var(--color-line)",
              color: "var(--color-ink-soft)",
              borderRadius: "10px",
              fontFamily: "var(--font-body)",
              fontWeight: 500,
              fontSize: "0.875rem",
              textDecoration: "none",
              transition: "opacity 0.15s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.8")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
          >
            Cancel
          </Link>
        </div>
      </div>
    </div>
  );
}
