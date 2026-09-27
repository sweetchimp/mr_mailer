import Link from "next/link";
import { requireUser } from "@/lib/current-session.server";
import { getDashboardCounts, getProviderForUser } from "@/services/dashboard.server";
import { MrMailerLogo } from "@/components/mr-mailer-logo";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { VerseModal } from "@/components/verse-modal";
import { Watermark } from "@/components/watermark";
import { RefreshButton } from "@/components/refresh-button";

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 12 && hour < 17) return "Good afternoon";
  if (hour >= 17) return "Good evening";
  return "Good morning";
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const [counts, provider] = await Promise.all([
    getDashboardCounts(user.id),
    getProviderForUser(user.id),
  ]);

  const firstName = user.name?.split(" ")[0] ?? "there";
  const tokenRevoked = !!user.tokenRevokedAt;
  const total =
    counts.high + counts.medium + counts.low + counts.replied + counts.snoozed;

  const fullDate = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div style={{ position: "relative", minHeight: "100vh" }}>
      <Watermark />
      <VerseModal />

      <header
        style={{
          background: "var(--color-masthead)",
          padding: "24px 24px 20px",
        }}
      >
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center justify-between">
            <MrMailerLogo size={38} light />
            <span
              className="text-[11px]"
              style={{
                fontFamily: "var(--font-mono)",
                color: "rgba(255,255,255,0.6)",
              }}
            >
              {fullDate}
            </span>
          </div>

          <h1
            className="mt-6 text-[28px] leading-tight font-semibold"
            style={{ fontFamily: "var(--font-display)", color: "#FFFFFF" }}
          >
            {getGreeting()}, {firstName}.
          </h1>
          <p
            className="mt-1 text-sm"
            style={{ fontFamily: "var(--font-body)", color: "rgba(255,255,255,0.75)" }}
          >
            Here&apos;s what&apos;s waiting for you today.
          </p>

          <div
            className="mt-4 flex flex-wrap items-center gap-x-2 text-[12px]"
            style={{ fontFamily: "var(--font-mono)", color: "rgba(255,255,255,0.5)" }}
          >
            {total === 0 && !tokenRevoked ? (
              <>
                <span>Digesting your inbox…</span>
                <span>&middot;</span>
              </>
            ) : (
              <>
                {counts.high > 0 && <span>{counts.high} need a reply</span>}
                {counts.high > 0 && counts.medium > 0 && <span>&middot;</span>}
                {counts.medium > 0 && <span>{counts.medium} worth a glance</span>}
                {counts.medium > 0 && counts.low > 0 && <span>&middot;</span>}
                {counts.low > 0 && <span>{counts.low} fyi</span>}
                {(counts.high > 0 || counts.medium > 0 || counts.low > 0) &&
                  counts.snoozed > 0 && <span>&middot;</span>}
                {counts.snoozed > 0 && <span>{counts.snoozed} snoozed</span>}
                <span>&middot;</span>
              </>
            )}
            <RefreshButton light />
          </div>
        </div>
      </header>

      {tokenRevoked && (
        <div className="mx-auto max-w-3xl px-4 pt-4">
          <div
            className="rounded-r-md border-l-[3px] p-4"
            style={{
              background: "var(--color-priority-high-bg)",
              borderLeftColor: "var(--color-priority-high-line)",
            }}
          >
            <p
              className="text-sm font-medium"
              style={{ color: "var(--color-priority-high-text)" }}
            >
              Your mailbox connection needs reauthorization. Digest, reply, and
              reminder features are paused.
            </p>
            <Link
              href={`/auth/${provider === "MICROSOFT" ? "microsoft" : "google"}/login`}
              className="mt-2 inline-block text-sm font-medium underline"
              style={{ color: "var(--color-priority-high-text)" }}
            >
              Reconnect {provider === "MICROSOFT" ? "Microsoft" : "Google"} &rarr;
            </Link>
          </div>
        </div>
      )}

      <div style={{ position: "relative", zIndex: 2 }}>{children}</div>

      <footer
        className="mx-auto max-w-3xl px-4 pb-8 pt-4"
        style={{ position: "relative", zIndex: 2, fontFamily: "var(--font-mono)" }}
      >
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl px-3 py-2"
          style={{ background: "var(--color-card)", border: "1px solid var(--color-line)" }}
        >
          <nav className="flex flex-wrap items-center gap-1" aria-label="Main">
            <Link
              href="/dashboard"
              className="btn btn-primary px-3 py-2 text-[12px]"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              Dashboard
            </Link>
          </nav>
          <div className="flex items-center gap-2">
            <ThemeSwitcher />
            <Link
              href="/auth/logout"
              className="btn btn-danger px-3 py-2 text-[12px]"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              Log out
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
