import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionCookieName } from "@/lib/session.server";

async function handleLogout() {
  "use server";
  const store = await cookies();
  store.delete(getSessionCookieName());
  redirect("/login");
}

export default function Logout() {
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
          <form action={handleLogout}>
            <button
              type="submit"
              className="btn btn-primary px-5 py-2.5 text-sm"
              style={{ fontFamily: "var(--font-body)" }}
            >
              Yes, log out
            </button>
          </form>
          <Link
            href="/dashboard"
            className="btn btn-outline px-5 py-2.5 text-sm"
            style={{ fontFamily: "var(--font-body)" }}
          >
            Cancel
          </Link>
        </div>
      </div>
    </div>
  );
}