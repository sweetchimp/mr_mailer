import { useState, useEffect, useMemo } from "react";
import { Link, NavLink, Outlet, useFetcher } from "react-router";
import { authMiddleware } from "../middleware/auth.server";
import { withSessionCookie } from "../lib/session.server";
import { runDigestPipeline } from "../services/digest.server";
import { prisma } from "../lib/prisma.server";
import { userContext } from "../context";
import { MrMailerLogo } from "../components/MrMailerLogo";
import { ThemeSwitcher } from "../components/ThemeSwitcher";
import type { Route } from "./+types/dashboard";

export const middleware = [authMiddleware];

const VERSES = [
  { text: "Be still, and know that I am God.", ref: "Psalm 46:10" },
  { text: "The Lord is my shepherd; I shall not want. He makes me lie down in green pastures.", ref: "Psalm 23:1-2" },
  { text: "Trust in the Lord with all your heart, and do not lean on your own understanding.", ref: "Proverbs 3:5" },
  { text: "For I know the plans I have for you, declares the Lord, plans for welfare and not for evil, to give you a future and a hope.", ref: "Jeremiah 29:11" },
  { text: "The steadfast love of the Lord never ceases; his mercies never come to an end; they are new every morning.", ref: "Lamentations 3:22-23" },
  { text: "Come to me, all who labor and are heavy laden, and I will give you rest.", ref: "Matthew 11:28" },
  { text: "I can do all things through him who strengthens me.", ref: "Philippians 4:13" },
  { text: "The Lord will fight for you, and you have only to be silent.", ref: "Exodus 14:14" },
  { text: "He who began a good work in you will carry it on to completion.", ref: "Philippians 1:6" },
  { text: "This is the day that the Lord has made; let us rejoice and be glad in it.", ref: "Psalm 118:24" },
];

function getDayOfYear(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 12 && hour < 17) return "Good afternoon";
  if (hour >= 17) return "Good evening";
  return "Good morning";
}

export interface DashboardCounts {
  high: number;
  medium: number;
  low: number;
  replied: number;
  snoozed: number;
  history: number;
}

export interface DashboardLoaderData {
  user: { name: string | null; email: string };
  counts: DashboardCounts;
  greeting: string;
  firstName: string;
  tokenRevoked: boolean;
  provider: "GOOGLE" | "MICROSOFT";
}

export async function loader({ context }: Route.LoaderArgs) {
  const user = context.get(userContext)!;

  const [high, medium, low, replied, snoozed, history] = await Promise.all([
    prisma.emailSummary.count({ where: { userId: user.id, status: "PENDING", priority: "HIGH" } }),
    prisma.emailSummary.count({ where: { userId: user.id, status: "PENDING", priority: "MEDIUM" } }),
    prisma.emailSummary.count({ where: { userId: user.id, status: "PENDING", priority: "LOW" } }),
    prisma.emailSummary.count({ where: { userId: user.id, status: "SENT" } }),
    prisma.emailSummary.count({ where: { userId: user.id, status: "SNOOZED" } }),
    prisma.emailSummary.count({ where: { userId: user.id, status: { in: ["SENT", "DISMISSED"] } } }),
  ]);

  const latestToken = await prisma.oAuthToken.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: { provider: true },
  });

  const firstName = user.name?.split(" ")[0] ?? "there";
  const greeting = getGreeting();

  const data: DashboardLoaderData = {
    user: { name: user.name, email: user.email },
    counts: { high, medium, low, replied, snoozed, history },
    greeting,
    firstName,
    tokenRevoked: !!user.tokenRevokedAt,
    provider: latestToken?.provider ?? "GOOGLE",
  };

  return withSessionCookie(data as unknown as Record<string, unknown>, context) as unknown as typeof data;
}

export async function action({ request, context }: Route.ActionArgs) {
  const user = context.get(userContext)!;
  const formData = await request.formData();

  if (formData.get("intent") === "refresh") {
    try {
      await runDigestPipeline(user.id);
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const step = (error as Error & { step?: string }).step ?? "unknown";
      console.error("Refresh failed:", errorMessage);

      await prisma.jobFailure
        .create({
          data: {
            userId: user.id,
            jobType: "morning-digest",
            step,
            errorMessage,
            context: JSON.stringify({
              source: "manual-refresh",
              timestamp: new Date().toISOString(),
            }),
          },
        })
        .catch(() => {});

      return { success: false, error: errorMessage };
    }
  }

  return { success: true };
}

function VerseModal({ onDismiss }: { onDismiss: () => void }) {
  const verse = VERSES[getDayOfYear() % VERSES.length];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0"
        style={{ background: "rgba(0,0,0,0.6)" }}
        onClick={onDismiss}
      />
      <div
        className="relative mx-4 w-full max-w-md rounded-[10px] p-8 text-center"
        style={{
          background: "var(--color-card)",
          boxShadow: "0 25px 60px rgba(0,0,0,0.3)",
        }}
      >
        <p
          className="mb-4 text-[11px] uppercase tracking-[0.15em]"
          style={{
            fontFamily: "var(--font-mono)",
            color: "var(--color-ink-faint)",
          }}
        >
          Today&apos;s verse
        </p>
        <p
          className="mb-3 text-lg leading-relaxed"
          style={{
            fontFamily: "var(--font-display)",
            fontStyle: "italic",
            fontWeight: 500,
            color: "var(--color-ink)",
          }}
        >
          {verse.text}
        </p>
        <p
          className="mb-6 text-sm"
          style={{
            fontFamily: "var(--font-mono)",
            color: "var(--color-ink-soft)",
          }}
        >
          {verse.ref}
        </p>
        <button
          onClick={onDismiss}
          className="btn btn-primary w-full px-6 py-3 text-sm"
          style={{ fontFamily: "var(--font-body)" }}
        >
          Begin my morning
        </button>
      </div>
    </div>
  );
}

export default function DashboardLayout({ loaderData }: Route.ComponentProps) {
  const { counts, greeting, firstName, tokenRevoked, provider } =
    loaderData as DashboardLoaderData;
  const [verseDismissed, setVerseDismissed] = useState(true);
  const refreshFetcher = useFetcher();

  const todayKey = useMemo(() => {
    const d = new Date();
    return `mr-mailer-verse-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  useEffect(() => {
    try {
      const dismissed = localStorage.getItem(todayKey);
      if (!dismissed) {
        setVerseDismissed(false);
      }
    } catch {
      // localStorage unavailable — skip modal
    }
  }, [todayKey]);

  const dismissVerse = () => {
    setVerseDismissed(true);
    try {
      localStorage.setItem(todayKey, "1");
    } catch {
      // ignore
    }
  };

  const total = counts.high + counts.medium + counts.low + counts.replied + counts.snoozed;

  const formattedFullDate = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  useEffect(() => {
    const data = refreshFetcher.data as { success?: boolean } | undefined;
    if (refreshFetcher.state === "idle" && data && data.success !== false) {
      window.location.reload();
    }
  }, [refreshFetcher.state, refreshFetcher.data]);

  return (
    <div style={{ minHeight: "100vh" }}>
      {!verseDismissed && <VerseModal onDismiss={dismissVerse} />}

      {/* Masthead */}
      <header
        style={{
          background: "var(--color-masthead)",
          padding: "24px 24px 20px",
        }}
      >
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <MrMailerLogo size={38} light />
            </div>
            <span
              className="text-[11px]"
              style={{ fontFamily: "var(--font-mono)", color: "rgba(255,255,255,0.6)" }}
            >
              {formattedFullDate}
            </span>
          </div>

          <h1
            className="mt-6 text-[28px] leading-tight font-semibold"
            style={{ fontFamily: "var(--font-display)", color: "#FFFFFF" }}
          >
            {greeting}, {firstName}.
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
                <span>Digesting your inbox&hellip;</span>
                <span>&middot;</span>
                <refreshFetcher.Form method="post">
                  <input type="hidden" name="intent" value="refresh" />
                  <button
                    type="submit"
                    disabled={refreshFetcher.state !== "idle"}
                    className="btn cursor-pointer border-none bg-transparent p-0 text-[12px] underline decoration-current underline-offset-2 hover:opacity-70 disabled:opacity-40"
                    style={{ fontFamily: "var(--font-mono)", color: "rgba(255,255,255,0.5)" }}
                  >
                    {refreshFetcher.state !== "idle" ? "Refreshing..." : "Refresh now"}
                  </button>
                </refreshFetcher.Form>
              </>
            ) : (
              <>
                {counts.high > 0 && <span>{counts.high} need a reply</span>}
                {counts.high > 0 && counts.medium > 0 && <span>&middot;</span>}
                {counts.medium > 0 && <span>{counts.medium} worth a glance</span>}
                {counts.medium > 0 && counts.low > 0 && <span>&middot;</span>}
                {counts.low > 0 && <span>{counts.low} fyi</span>}
                {(counts.high > 0 || counts.medium > 0 || counts.low > 0) && counts.snoozed > 0 && <span>&middot;</span>}
                {counts.snoozed > 0 && <span>{counts.snoozed} snoozed</span>}
                <span>&middot;</span>
                <refreshFetcher.Form method="post">
                  <input type="hidden" name="intent" value="refresh" />
                  <button
                    type="submit"
                    disabled={refreshFetcher.state !== "idle"}
                    className="btn cursor-pointer border-none bg-transparent p-0 text-[12px] underline decoration-current underline-offset-2 hover:opacity-70 disabled:opacity-40"
                    style={{ fontFamily: "var(--font-mono)", color: "rgba(255,255,255,0.5)" }}
                  >
                    {refreshFetcher.state !== "idle" ? "Refreshing..." : "Refresh now"}
                  </button>
                </refreshFetcher.Form>
              </>
            )}
          </div>
        </div>
      </header>

      {refreshFetcher.data && (refreshFetcher.data as { success?: boolean }).success === false && (
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
              Refresh failed
            </p>
            <p
              className="mt-1 text-[13px]"
              style={{ color: "var(--color-priority-high-text)", opacity: 0.85 }}
            >
              {(refreshFetcher.data as { error?: string }).error}
            </p>
          </div>
        </div>
      )}

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
              Your mailbox connection needs reauthorization. Digest, reply, and reminder features are paused.
            </p>
            <Link
              to={`/auth/${provider === "MICROSOFT" ? "microsoft" : "google"}/login`}
              className="mt-2 inline-block text-sm font-medium underline"
              style={{ color: "var(--color-priority-high-text)" }}
            >
              Reconnect {provider === "MICROSOFT" ? "Microsoft" : "Google"} &rarr;
            </Link>
          </div>
        </div>
      )}

      <Outlet />

      {/* Footer nav */}
      <footer
        className="mx-auto max-w-3xl px-4 pb-8 pt-4"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl px-3 py-2"
          style={{ background: "var(--color-card)", border: "1px solid var(--color-line)" }}
        >
          <nav className="flex flex-wrap items-center gap-1" aria-label="Main">
            <NavLink
              to="/dashboard"
              end
              className={({ isActive }) =>
                `btn px-3 py-2 text-[12px] ${isActive ? "btn-primary" : "btn-soft"}`
              }
              style={{ fontFamily: "var(--font-mono)" }}
            >
              Dashboard
            </NavLink>
            <NavLink
              to="/schedule"
              className={({ isActive }) =>
                `btn px-3 py-2 text-[12px] ${isActive ? "btn-primary" : "btn-soft"}`
              }
              style={{ fontFamily: "var(--font-mono)" }}
            >
              Schedule
            </NavLink>
            <NavLink
              to="/minutes"
              className={({ isActive }) =>
                `btn px-3 py-2 text-[12px] ${isActive ? "btn-primary" : "btn-soft"}`
              }
              style={{ fontFamily: "var(--font-mono)" }}
            >
              Minutes
            </NavLink>
            <NavLink
              to="/admin/job-failures"
              className={({ isActive }) =>
                `btn px-3 py-2 text-[12px] ${isActive ? "btn-primary" : "btn-soft"}`
              }
              style={{ fontFamily: "var(--font-mono)" }}
            >
              Job failures
            </NavLink>
          </nav>
          <div className="flex items-center gap-2">
            <ThemeSwitcher />
            <Link
              to="/auth/logout"
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
