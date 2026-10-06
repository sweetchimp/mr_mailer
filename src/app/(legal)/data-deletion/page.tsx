import type { Metadata } from "next";
import Link from "next/link";
import { getContactEmail, getOperatorName, getRetentionDays } from "@/lib/env.server";

export const metadata: Metadata = {
  title: "Delete Your Data — Mr Mailer",
  description:
    "How to remove everything Mr Mailer stores about you, in the app or by asking us directly.",
};

export const dynamic = "force-dynamic";

export default function DataDeletionPage() {
  const operator = getOperatorName();
  const contact = getContactEmail();
  const retentionDays = getRetentionDays();

  return (
    <>
      <h1>Delete Your Data</h1>
      <p className="lede">
        Everything Mr Mailer stores about you is tied to your account. There is
        one action that removes all of it, and two ways to cut off access on the
        provider side.
      </p>

      <h2>What is stored about you</h2>
      <p>For completeness, this is the full list the deletion removes:</p>
      <ul>
        <li>Your name, email address and Google or Microsoft account ID.</li>
        <li>Your stored OAuth access and refresh tokens (encrypted).</li>
        <li>
          Every summarised email: subject, sender, priority, the AI summary,
          the suggested reply, its status, and the stored plain-text body.
        </li>
        <li>
          Every reply you sent along with the draft that preceded it, and the
          counts of what you changed.
        </li>
        <li>Your writing-style profile.</li>
        <li>Per-sender preferences and dismissal counters.</li>
        <li>Meeting minutes you pasted, meeting reminders, schedule blocks.</li>
        <li>Job failure records for your account.</li>
        <li>Any jobs still waiting or scheduled in the background queue.</li>
      </ul>
      <p>
        Automatic cleanup already removes summarised emails and job failures
        after <strong>{retentionDays} days</strong>. It does not touch the rest
        — deleting your account is what covers those.
      </p>

      <h2>Option 1 — delete it yourself in the app</h2>
      <ol>
        <li>
          Sign in and open <Link href="/settings">Settings</Link>.
        </li>
        <li>
          Scroll to <strong>Delete my account</strong> and read the warning.
        </li>
        <li>
          Type your email address exactly as it appears on the account to
          confirm.
        </li>
        <li>
          Choose <strong>Delete my account</strong>. The app removes your rows,
          clears queued jobs, revokes your Google token, signs you out, and
          shows you a confirmation.
        </li>
      </ol>
      <p>
        This cannot be undone. It does not delete anything already sent from
        your mailbox, and it does not delete mail that is still in your own
        Google or Microsoft account — Mr Mailer only ever had its own copy.
      </p>

      <h2>Option 2 — ask us to do it</h2>
      <p>
        Email <a href={`mailto:${contact}`}>{contact}</a> from the address on
        your account and say you want your data deleted. We will remove it and
        confirm when it is done.
      </p>

      <h2>Cutting off access on the provider side</h2>
      <h3>Google</h3>
      <p>
        Mr Mailer revokes its own token when you delete your account, but you
        can also do it yourself first at{" "}
        <a href="https://myaccount.google.com/permissions">
          myaccount.google.com/permissions
        </a>{" "}
        by removing Mr Mailer. That takes effect immediately, independent of
        anything this app does.
      </p>
      <h3>Microsoft</h3>
      <p>
        <strong>We cannot revoke Microsoft consent for you</strong> — Microsoft
        does not offer an equivalent server-side revocation for this flow, so
        the token this app holds is only invalidated once you remove the
        permission yourself.
      </p>
      <p>
        Go to <a href="https://account.microsoft.com">account.microsoft.com</a>,
        open <strong>Privacy</strong> → <strong>Apps and services</strong>, find
        Mr Mailer, and remove access. Then come back and delete your account
        here so the stored copy of your data goes too.
      </p>

      <h2>Questions</h2>
      <p>
        <a href={`mailto:${contact}`}>{contact}</a> — operated by{" "}
        <strong>{operator}</strong>.
      </p>
    </>
  );
}
