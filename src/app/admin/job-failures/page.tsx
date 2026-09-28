import Link from "next/link";
import { requireUser } from "@/lib/current-session.server";
import { getJobFailures } from "@/services/dashboard.server";

export const dynamic = "force-dynamic";

/**
 * `context` is written as a JSON string but was never a contract, so it is
 * parsed defensively: a row written by an older build, or a hand-edited one,
 * must not be able to blank the page.
 */
function prettyContext(raw: string | null): string | null {
  if (!raw) return null;
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

export default async function JobFailuresPage() {
  const user = await requireUser();
  const failures = await getJobFailures(user.id);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Link
        href="/dashboard"
        className="btn btn-link text-xs"
        style={{ fontFamily: "var(--font-body)" }}
      >
        &larr; Back to overview
      </Link>

      <h2
        className="mt-4 text-[13px] font-medium uppercase tracking-[0.15em]"
        style={{ fontFamily: "var(--font-mono)", color: "var(--color-ink-soft)" }}
      >
        Job failures
      </h2>

      <p
        className="mt-2 text-sm"
        style={{ fontFamily: "var(--font-body)", color: "var(--color-ink-soft)" }}
      >
        {failures.length === 0
          ? "No recorded failures. Digest and reminder jobs log their own faults here."
          : `${failures.length} recorded failure${failures.length === 1 ? "" : "s"}, newest first. Rows older than the retention window are removed by the nightly cleanup.`}
      </p>

      {failures.length === 0 ? (
        <p
          className="mt-6 text-sm"
          style={{ fontFamily: "var(--font-body)", color: "var(--color-ink-faint)" }}
        >
          Nothing to report.
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {failures.map((failure) => {
            const context = prettyContext(failure.context);

            return (
              <li
                key={failure.id}
                className="rounded-lg border p-4"
                style={{
                  borderColor: "var(--color-line, #e5e5e5)",
                  background: "var(--color-surface, #fff)",
                }}
              >
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span
                    className="text-[11px] uppercase tracking-[0.12em]"
                    style={{
                      fontFamily: "var(--font-mono)",
                      color: "var(--color-ink-soft)",
                    }}
                  >
                    {failure.jobType} &middot; {failure.step}
                  </span>
                  <time
                    dateTime={failure.createdAt}
                    className="text-[11px]"
                    style={{
                      fontFamily: "var(--font-mono)",
                      color: "var(--color-ink-faint)",
                    }}
                  >
                    {new Date(failure.createdAt).toLocaleString("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                      day: "numeric",
                      month: "short",
                    })}
                  </time>
                </div>

                <p
                  className="mt-2 text-sm"
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  {failure.errorMessage}
                </p>

                {context && (
                  <details className="mt-2">
                    <summary
                      className="cursor-pointer text-[11px] uppercase tracking-[0.12em]"
                      style={{
                        fontFamily: "var(--font-mono)",
                        color: "var(--color-ink-soft)",
                      }}
                    >
                      Context
                    </summary>
                    <pre
                      className="mt-2 overflow-x-auto rounded p-2 text-[11px]"
                      style={{
                        fontFamily: "var(--font-mono)",
                        color: "var(--color-ink-soft)",
                        background: "var(--color-ink, #111)",
                        opacity: 0.9,
                      }}
                    >
                      {context}
                    </pre>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
