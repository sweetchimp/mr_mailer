import { useState, useEffect, useMemo } from "react";
import { Link, Outlet, useFetcher } from "react-router";
import { authMiddleware } from "../middleware/auth.server";
import { withSessionCookie } from "../lib/session.server";
import { runDigestPipeline } from "../services/digest.server";
import { prisma } from "../lib/prisma.server";
import { userContext } from "../context";
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

  const firstName = user.name?.split(" ")[0] ?? "there";
  const greeting = getGreeting();

  const data: DashboardLoaderData = {
    user: { name: user.name, email: user.email },
    counts: { high, medium, low, replied, snoozed, history },
    greeting,
    firstName,
    tokenRevoked: !!user.tokenRevokedAt,
  };

  return withSessionCookie(data as unknown as Record<string, unknown>, context) as unknown as typeof data;
}

export async function action({ request, context }: Route.ActionArgs) {
  const user = context.get(userContext)!;
  const formData = await request.formData();

  if (formData.get("intent") === "refresh") {
    try {
      await runDigestPipeline(user.id);
    } catch (error) {
      console.error("Refresh failed:", error);
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
          className="w-full cursor-pointer rounded-[10px] px-6 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90"
          style={{
            background: "var(--color-dawn-1)",
            fontFamily: "var(--font-body)",
          }}
        >
          Begin my morning
        </button>
      </div>
    </div>
  );
}

export default function DashboardLayout({ loaderData }: Route.ComponentProps) {
  const { counts, greeting, firstName, tokenRevoked } =
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

  return (
    <div style={{ minHeight: "100vh" }}>
      {!verseDismissed && <VerseModal onDismiss={dismissVerse} />}

      {/* Masthead */}
      <header
        style={{
          background: "linear-gradient(100deg, var(--color-dawn-1), var(--color-dawn-2), var(--color-dawn-3))",
          padding: "32px 24px 28px",
        }}
      >
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-9 w-9">
                <defs>
                  <linearGradient id="mastGrad" x1="60" y1="74" x2="60" y2="42" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#E8A548" />
                    <stop offset="100%" stopColor="#8C5A63" />
                  </linearGradient>
                </defs>
                <rect x="14" y="32" width="92" height="68" rx="14" stroke="#F5F0E6" strokeWidth="6" fill="none" />
                <path d="M18 34L60 74L102 34" stroke="#F5F0E6" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="60" cy="58" r="16" fill="url(#mastGrad)" />
              </svg>
              <span
                className="text-xl"
                style={{ fontFamily: "var(--font-display)", fontWeight: 500, color: "#FFFFFF" }}
              >
                Mr Mailer
              </span>
            </div>
            <span
              className="text-[11px]"
              style={{ fontFamily: "var(--font-mono)", color: "rgba(255,255,255,0.5)" }}
            >
              {formattedFullDate}
            </span>
          </div>

          <h1
            className="mt-6 text-[28px] leading-tight"
            style={{ fontFamily: "var(--font-display)", fontWeight: 500, color: "#FFFFFF" }}
          >
            {greeting}, {firstName}.
          </h1>
          <p
            className="mt-1 text-sm"
            style={{ fontFamily: "var(--font-body)", color: "rgba(255,255,255,0.7)" }}
          >
            Here&apos;s what&apos;s waiting for you today.
          </p>

          {total > 0 && (
            <div
              className="mt-4 flex flex-wrap items-center gap-x-2 text-[12px]"
              style={{ fontFamily: "var(--font-mono)", color: "rgba(255,255,255,0.5)" }}
            >
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
                  className="cursor-pointer border-none bg-transparent p-0 text-[12px] underline decoration-current underline-offset-2 hover:opacity-70 disabled:opacity-40"
                  style={{ fontFamily: "var(--font-mono)", color: "rgba(255,255,255,0.5)" }}
                >
                  {refreshFetcher.state !== "idle" ? "Refreshing..." : "Refresh now"}
                </button>
              </refreshFetcher.Form>
            </div>
          )}
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
              Gmail access was revoked. Your daily digest and reply features are paused.
            </p>
            <Link
              to="/auth/google/login"
              className="mt-2 inline-block text-sm font-medium underline"
              style={{ color: "var(--color-priority-high-text)" }}
            >
              Reconnect Gmail &rarr;
            </Link>
          </div>
        </div>
      )}

      <Outlet />

      {/* Footer */}
      <footer
        className="mx-auto max-w-3xl px-4 pb-8 pt-4 text-center text-[11px]"
        style={{ fontFamily: "var(--font-mono)", color: "var(--color-ink-faint)" }}
      >
        <div className="flex items-center justify-center gap-4">
          <Link
            to="/admin/job-failures"
            className="hover:opacity-70"
            style={{ color: "var(--color-ink-faint)" }}
          >
            Job failures
          </Link>
          <Link
            to="/auth/logout"
            className="hover:opacity-70"
            style={{ color: "var(--color-ink-faint)" }}
          >
            Log out
          </Link>
        </div>
      </footer>
    </div>
  );
}
