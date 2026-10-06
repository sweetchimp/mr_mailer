import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma.server";
import { requireUser } from "@/lib/current-session.server";
import { DeleteAccountForm } from "@/components/delete-account-form";
import { LegalFooter } from "@/components/legal-footer";
import { WeeklyDigestOptIn } from "@/components/weekly-digest-opt-in";

export const metadata: Metadata = {
  title: "Settings — Mr Mailer",
};

function card(): React.CSSProperties {
  return {
    background: "var(--color-card)",
    border: "1px solid var(--color-line)",
    borderRadius: "12px",
    padding: "20px",
  };
}

function heading(): React.CSSProperties {
  return {
    fontFamily: "var(--font-body)",
    fontSize: "13px",
    fontWeight: 600,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--color-ink-faint)",
    margin: "0 0 14px",
  };
}

export default async function SettingsPage() {
  const user = await requireUser();

  const grant = await prisma.oAuthToken.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: { provider: true, scope: true },
  });
  const provider = grant?.provider ?? "GOOGLE";

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1
        className="text-[24px] font-semibold"
        style={{ fontFamily: "var(--font-display)", color: "var(--color-ink)" }}
      >
        Settings
      </h1>

      <section style={{ ...card(), marginTop: "20px" }}>
        <h2 style={heading()}>Account</h2>
        <dl className="grid gap-3 text-[14px] sm:grid-cols-2">
          <div>
            <dt
              className="text-[12px]"
              style={{ fontFamily: "var(--font-mono)", color: "var(--color-ink-faint)" }}
            >
              Signed in as
            </dt>
            <dd
              className="mt-0.5 break-words"
              style={{ fontFamily: "var(--font-body)", color: "var(--color-ink)" }}
            >
              {user.name ?? "—"}
            </dd>
          </div>
          <div>
            <dt
              className="text-[12px]"
              style={{ fontFamily: "var(--font-mono)", color: "var(--color-ink-faint)" }}
            >
              Email
            </dt>
            <dd
              className="mt-0.5 break-words"
              style={{ fontFamily: "var(--font-body)", color: "var(--color-ink)" }}
            >
              {user.email}
            </dd>
          </div>
          <div>
            <dt
              className="text-[12px]"
              style={{ fontFamily: "var(--font-mono)", color: "var(--color-ink-faint)" }}
            >
              Connected provider
            </dt>
            <dd
              className="mt-0.5"
              style={{ fontFamily: "var(--font-body)", color: "var(--color-ink)" }}
            >
              {provider === "MICROSOFT" ? "Microsoft" : "Google"}
            </dd>
          </div>
          <div>
            <dt
              className="text-[12px]"
              style={{ fontFamily: "var(--font-mono)", color: "var(--color-ink-faint)" }}
            >
              Member since
            </dt>
            <dd
              className="mt-0.5"
              style={{ fontFamily: "var(--font-body)", color: "var(--color-ink)" }}
            >
              {user.createdAt.toLocaleDateString("en-GB", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </dd>
          </div>
        </dl>
      </section>

      <section style={{ ...card(), marginTop: "20px" }}>
        <h2 style={heading()}>Email preferences</h2>
        <WeeklyDigestOptIn
          initialEnabled={user.weeklyDigestEmail}
          recipient={user.email}
        />
      </section>

      <section style={{ ...card(), marginTop: "20px" }}>
        <h2 style={heading()}>Your data</h2>
        <p
          className="text-[14px] leading-[1.7]"
          style={{ fontFamily: "var(--font-body)", color: "var(--color-ink-soft)" }}
        >
          What is stored about you, where it goes, and how long it is kept is
          set out in the privacy policy. Deletion steps — including removing
          consent on Google&apos;s or Microsoft&apos;s side — are on the data
          deletion page.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/privacy"
            className="btn btn-outline px-4 py-2 text-[13px]"
            style={{ fontFamily: "var(--font-body)" }}
          >
            Privacy policy
          </Link>
          <Link
            href="/terms"
            className="btn btn-outline px-4 py-2 text-[13px]"
            style={{ fontFamily: "var(--font-body)" }}
          >
            Terms
          </Link>
          <Link
            href="/data-deletion"
            className="btn btn-outline px-4 py-2 text-[13px]"
            style={{ fontFamily: "var(--font-body)" }}
          >
            Delete your data
          </Link>
        </div>
      </section>

      <section style={{ marginTop: "20px" }}>
        <DeleteAccountForm userEmail={user.email} provider={provider} />
      </section>

      <div className="mt-8">
        <LegalFooter />
      </div>
    </main>
  );
}
