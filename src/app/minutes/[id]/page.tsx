import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/current-session.server";
import { getMinutesById } from "@/services/minutes.server";
import { splitAttendees } from "@/lib/minutes-view";
import type { ActionItem } from "@/lib/minutes-view";

/**
 * `params` is typed explicitly rather than with the generated
 * `PageProps<"/minutes/[id]">` global. That global resolves against
 * `AppRoutes` in `.next/types/routes.d.ts`, which only learns about
 * `/minutes/[id]` once a build has regenerated it — so a `tsc --noEmit` on a
 * clean checkout, before anything has been run, would fail on the type rather
 * than on the code.
 */
export default async function MinutesDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  // Scoped by userId inside the service, so a row belonging to someone else
  // and a row that does not exist both arrive here as `null` and render the
  // same 404. The detail view cannot be used to probe for other users' ids.
  const minutes = await getMinutesById(user.id, id);
  if (!minutes) notFound();

  const attendees = splitAttendees(minutes.attendees);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Link
        href="/minutes"
        className="btn btn-link text-xs"
        style={{ fontFamily: "var(--font-body)" }}
      >
        &larr; All minutes
      </Link>

      <h2
        className="mt-4 text-[13px] font-medium uppercase tracking-[0.15em]"
        style={{ fontFamily: "var(--font-mono)", color: "var(--color-ink-soft)" }}
      >
        Meeting Minutes
      </h2>

      <h1
        className="mt-2 text-2xl leading-tight font-semibold"
        style={{ fontFamily: "var(--font-display)", color: "var(--color-ink)" }}
      >
        {minutes.title}
      </h1>

      <p
        className="mt-2 text-[12px]"
        style={{ fontFamily: "var(--font-mono)", color: "var(--color-ink-faint)" }}
      >
        {new Date(minutes.date).toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
        })}
        {attendees.length > 0 && (
          <>
            <span> &middot; </span>
            {attendees.length} attendee{attendees.length === 1 ? "" : "s"}
          </>
        )}
      </p>

      {attendees.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {attendees.map((name) => (
            <li
              key={name}
              className="rounded-full px-2 py-px text-[10px] uppercase"
              style={{
                fontFamily: "var(--font-mono)",
                fontWeight: 500,
                background: "var(--color-surface-soft)",
                color: "var(--color-ink-soft)",
              }}
            >
              {name}
            </li>
          ))}
        </ul>
      )}

      <section
        className="mt-6 rounded-r-md border-l-[3px] p-4"
        style={{
          background: "var(--color-priority-medium-bg)",
          borderLeftColor: "var(--color-priority-medium-line)",
        }}
      >
        <p
          className="text-[10px] uppercase tracking-[0.1em]"
          style={{ fontFamily: "var(--font-mono)", color: "var(--color-priority-medium-text)" }}
        >
          Summary
        </p>
        <p
          className="mt-2 text-sm leading-relaxed"
          style={{ fontFamily: "var(--font-body)", color: "var(--color-ink)" }}
        >
          {minutes.summaryText}
        </p>
      </section>

      <Section heading="Key decisions" count={minutes.decisions.length}>
        <ul className="space-y-2.5">
          {minutes.decisions.map((decision, index) => (
            <li key={index} className="flex gap-2.5">
              <span
                aria-hidden="true"
                className="mt-[7px] h-[5px] w-[5px] shrink-0 rounded-full"
                style={{ background: "var(--color-priority-medium-text)" }}
              />
              <span
                className="text-sm leading-relaxed"
                style={{ fontFamily: "var(--font-body)", color: "var(--color-ink)" }}
              >
                {decision}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section heading="Action items" count={minutes.actionItems.length}>
        <ul className="space-y-2.5">
          {minutes.actionItems.map((item, index) => (
            <ActionItemRow key={index} item={item} />
          ))}
        </ul>
        <p
          className="mt-3 text-[11px]"
          style={{ fontFamily: "var(--font-mono)", color: "var(--color-ink-faint)" }}
        >
          Completion isn&apos;t tracked yet.
        </p>
      </Section>

      <Section heading="Next steps" count={minutes.nextSteps.length}>
        <ul className="space-y-2.5">
          {minutes.nextSteps.map((step, index) => (
            <li key={index} className="flex gap-2.5">
              <span
                aria-hidden="true"
                className="mt-[7px] h-[5px] w-[5px] shrink-0 rounded-full"
                style={{ background: "var(--color-priority-low-text)" }}
              />
              <span
                className="text-sm leading-relaxed"
                style={{ fontFamily: "var(--font-body)", color: "var(--color-ink)" }}
              >
                {step}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      {/* The notes are what the model actually saw. Keeping them one click
          away is the only way to check a minutes document that looks wrong. */}
      <details className="mt-6">
        <summary
          className="cursor-pointer text-[13px] font-medium uppercase tracking-[0.15em]"
          style={{ fontFamily: "var(--font-mono)", color: "var(--color-ink-soft)" }}
        >
          Raw notes
        </summary>
        <pre
          className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-xl p-4 text-[13px] leading-relaxed"
          style={{
            fontFamily: "var(--font-mono)",
            color: "var(--color-ink-soft)",
            background: "var(--color-card)",
            border: "1px solid var(--color-line)",
          }}
        >
          {minutes.rawNotes}
        </pre>
      </details>
    </main>
  );
}

function Section({
  heading,
  count,
  children,
}: {
  heading: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6">
      <div className="flex items-baseline gap-2">
        <h3
          className="text-[13px] font-medium uppercase tracking-[0.15em]"
          style={{ fontFamily: "var(--font-mono)", color: "var(--color-ink-soft)" }}
        >
          {heading}
        </h3>
        {count > 0 && (
          <span
            className="text-[11px]"
            style={{ fontFamily: "var(--font-mono)", color: "var(--color-ink-faint)" }}
          >
            {count}
          </span>
        )}
      </div>

      {count === 0 ? (
        <p
          className="mt-2 text-sm"
          style={{ fontFamily: "var(--font-body)", color: "var(--color-ink-faint)" }}
        >
          None recorded.
        </p>
      ) : (
        <div className="mt-3">{children}</div>
      )}
    </section>
  );
}

/**
 * A checklist row.
 *
 * The checkbox is a real `disabled` input rather than a decorative glyph so it
 * is announced correctly, but it is `disabled` and not interactive: the schema
 * has no completed flag, so a tick box that accepted a click would be
 * reporting state the database does not hold. `accentColor` keeps it at full
 * strength, which a disabled control otherwise greys out.
 */
function ActionItemRow({ item }: { item: ActionItem }) {
  return (
    <li className="flex items-start gap-2.5">
      <input
        type="checkbox"
        disabled
        aria-label={item.task}
        className="mt-[3px] h-[15px] w-[15px] shrink-0"
        style={{ accentColor: "var(--color-brand-blue)" }}
      />
      <span className="flex flex-wrap items-baseline gap-2">
        <span
          className="text-sm leading-relaxed"
          style={{ fontFamily: "var(--font-body)", color: "var(--color-ink)" }}
        >
          {item.task}
        </span>
        {item.owner && (
          <span
            className="rounded-full px-2 py-px text-[10px] uppercase"
            style={{
              fontFamily: "var(--font-mono)",
              fontWeight: 500,
              background: "var(--color-priority-low-bg)",
              color: "var(--color-priority-low-text)",
            }}
          >
            {item.owner}
          </span>
        )}
      </span>
    </li>
  );
}
