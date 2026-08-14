import { Link } from "react-router";
import { authMiddleware } from "../middleware/auth.server";
import { withSessionCookie } from "../lib/session.server";
import { prisma } from "../lib/prisma.server";
import { userContext } from "../context";
import type { Route } from "./+types/admin.job-failures";

export const middleware = [authMiddleware];

export async function loader({ context }: Route.LoaderArgs) {
  const user = context.get(userContext)!;

  const failures = await prisma.jobFailure.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const failuresSerialized = failures.map((f) => ({
    ...f,
    createdAt: f.createdAt.toISOString(),
  }));
  const data = { failures: failuresSerialized };
  return withSessionCookie(data, context) as unknown as typeof data;
}

export default function JobFailures({ loaderData }: Route.ComponentProps) {
  const { failures } = loaderData as { failures: { id: string; jobType: string; step: string; errorMessage: string; context: string | null; createdAt: string }[] };

  return (
    <div style={{ minHeight: "100vh" }}>
      <header
        style={{
          background: "var(--color-masthead)",
          padding: "24px",
        }}
      >
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center justify-between">
            <h1
              className="text-lg"
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 500,
                color: "#FFFFFF",
              }}
            >
              Job Failures
            </h1>
            <Link
              to="/dashboard"
              className="text-[11px] underline"
              style={{
                fontFamily: "var(--font-mono)",
                color: "rgba(255,255,255,0.6)",
              }}
            >
              &larr; Back to dashboard
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        {failures.length === 0 ? (
          <p
            className="text-sm"
            style={{
              fontFamily: "var(--font-body)",
              color: "var(--color-ink-faint)",
            }}
          >
            No job failures recorded. Everything is running smoothly.
          </p>
        ) : (
          <div className="space-y-3">
            {failures.map((failure) => (
              <div
                key={failure.id}
                style={{
                  background: "var(--color-card)",
                  border: "1px solid var(--color-line)",
                  borderRadius: "10px",
                  padding: "16px",
                }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="inline-block shrink-0 rounded-full bg-[var(--color-priority-high-bg)] px-2 py-px text-[10px] uppercase"
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontWeight: 500,
                          color: "var(--color-priority-high-text)",
                        }}
                      >
                        {failure.jobType}
                      </span>
                      <span
                        className="inline-block shrink-0 rounded-full bg-[var(--color-priority-medium-bg)] px-2 py-px text-[10px] uppercase"
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontWeight: 500,
                          color: "var(--color-priority-medium-text)",
                        }}
                      >
                        {failure.step}
                      </span>
                    </div>
                    <p
                      className="mt-2 text-sm"
                      style={{
                        fontFamily: "var(--font-body)",
                        color: "var(--color-ink)",
                      }}
                    >
                      {failure.errorMessage}
                    </p>
                    {failure.context && (
                      <p
                        className="mt-1 text-[11px]"
                        style={{
                          fontFamily: "var(--font-mono)",
                          color: "var(--color-ink-faint)",
                        }}
                      >
                        {failure.context}
                      </p>
                    )}
                  </div>
                  <span
                    className="shrink-0 text-[11px] whitespace-nowrap"
                    style={{
                      fontFamily: "var(--font-mono)",
                      color: "var(--color-ink-faint)",
                    }}
                  >
                    {new Date(failure.createdAt).toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
