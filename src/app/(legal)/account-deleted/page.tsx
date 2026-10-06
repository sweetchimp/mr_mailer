import type { Metadata } from "next";
import Link from "next/link";
import { getContactEmail } from "@/lib/env.server";

export const metadata: Metadata = {
  title: "Account Deleted — Mr Mailer",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

/**
 * Landing spot after `deleteAccountAction`. Outside the dashboard matcher on
 * purpose: by the time it renders, the user's row and session cookie are both
 * gone, so any route requiring a session would bounce them to /login and hide
 * the confirmation they came here to see.
 */
export default function AccountDeletedPage() {
  const contact = getContactEmail();

  return (
    <>
      <h1>Your account has been deleted</h1>
      <p className="lede">
        Everything Mr Mailer stored about you has been removed, any queued
        background jobs have been cancelled, and you have been signed out.
      </p>
      <p>
        Your Google token was revoked as part of the deletion. If you signed in
        with Microsoft, Mr Mailer cannot revoke that consent on your behalf —
        you can still remove it at{" "}
        <a href="https://account.microsoft.com">account.microsoft.com</a> under{" "}
        <em>Apps and services</em>.
      </p>
      <p>
        Nothing in your own mailbox was changed: Mr Mailer only ever held its
        own copy of what it read, and that copy is gone.
      </p>
      <p>
        <Link href="/">Back to Mr Mailer</Link> ·{" "}
        <a href={`mailto:${contact}`}>{contact}</a>
      </p>
    </>
  );
}
