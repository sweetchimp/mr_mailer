import Link from "next/link";
import { requireUser } from "@/lib/current-session.server";
import { MinutesForm } from "@/components/minutes-form";

export default async function NewMinutesPage() {
  // The action authorises the submission on its own, but rendering the form at
  // all should not depend on that: without this an unauthenticated visitor
  // would get the notes form and only discover the problem after pasting
  // everything in.
  await requireUser();

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
        New meeting minutes
      </h2>

      <p
        className="mt-2 text-sm"
        style={{ fontFamily: "var(--font-body)", color: "var(--color-ink-soft)" }}
      >
        Paste whatever you scribbled down. You get back a summary, the decisions,
        the action items, and any next steps.
      </p>

      <MinutesForm />
    </main>
  );
}
