import Link from "next/link";
import type { ReactNode } from "react";
import { BUCKET_COPY } from "@/lib/email-view";
import type { EmailBucket } from "@/lib/email-view";

export function BucketShell({
  bucket,
  count,
  children,
}: {
  bucket: EmailBucket;
  count: number;
  children: ReactNode;
}) {
  const copy = BUCKET_COPY[bucket];

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
        {copy.kicker}
      </h2>

      <p
        className="mt-2 text-sm"
        style={{ fontFamily: "var(--font-body)", color: "var(--color-ink-soft)" }}
      >
        {count === 0 ? copy.empty : copy.count(count)}
      </p>

      <div className="mt-4">{children}</div>
    </main>
  );
}
