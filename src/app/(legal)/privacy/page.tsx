import type { Metadata } from "next";
import { getContactEmail, getOperatorName, getRetentionDays } from "@/lib/env.server";

export const metadata: Metadata = {
  title: "Privacy Policy — Mr Mailer",
  description:
    "What Mr Mailer reads from Google and Microsoft, what it stores, what it sends to Groq, and how to delete it.",
};

/**
 * Rendered on demand rather than prerendered.
 *
 * The Docker build runs `npm run build` with no `.env` at all (`.dockerignore`
 * excludes it and compose injects it at run time), so a static page that reads
 * CONTACT_EMAIL would fail every image build. Making it dynamic defers that
 * read to request time, where a missing variable throws a legible error instead
 * of publishing a placeholder address.
 */
export const dynamic = "force-dynamic";

export default function PrivacyPage() {
  const operator = getOperatorName();
  const contact = getContactEmail();
  const retentionDays = getRetentionDays();

  return (
    <>
      <h1>Privacy Policy</h1>
      <p className="lede">
        Effective 6 October 2026. This policy is operated by {operator} for the
        Mr Mailer application. It describes exactly what the software does, and
        nothing more — where a practice is not implemented in the code, it is
        not claimed here.
      </p>

      <h2>1. What Mr Mailer is</h2>
      <p>
        Mr Mailer reads your recent email, groups it into what needs a reply,
        what is worth a glance, and what is FYI, and drafts replies you can edit
        before sending. It is an assistant that acts <strong>on your behalf</strong>,
        using access you grant it yourself through Google or Microsoft.
      </p>

      <h2>2. What we access from Google, and why</h2>
      <p>When you sign in with Google, Mr Mailer requests these scopes:</p>
      <ul>
        <li>
          <code>openid</code>, <code>email</code>, <code>profile</code> — to
          identify your account and show your name and address in the app.
        </li>
        <li>
          <code>https://www.googleapis.com/auth/gmail.readonly</code> — to read
          the subject, sender and body of recent messages so they can be
          categorised and summarised. We also read your Google Calendar event
          titles and times for the meeting reminder list; calendar attendee
          addresses are read from the response and discarded without being
          stored.
        </li>
        <li>
          <code>https://www.googleapis.com/auth/gmail.send</code> — to send the
          reply you have written and approved. Only the text of your reply, the
          recipient and the subject line are sent; no thread history or
          attachments are uploaded by Mr Mailer.
        </li>
        <li>
          <code>https://www.googleapis.com/auth/calendar.readonly</code> — to
          show today&apos;s meetings and remind you about them.
        </li>
      </ul>

      <h2>3. What we access from Microsoft, and why</h2>
      <p>When you sign in with Microsoft, Mr Mailer requests these scopes:</p>
      <ul>
        <li>
          <code>openid</code>, <code>email</code>, <code>profile</code>,{" "}
          <code>User.Read</code> — to identify your account and display your
          name and address.
        </li>
        <li>
          <code>Mail.Read</code> — to read the subject, sender and body of
          recent messages so they can be categorised and summarised.
        </li>
        <li>
          <code>Mail.Send</code> — to send the reply you have written and
          approved, and, only if you opt in, the optional Sunday evening summary
          email to yourself.
        </li>
        <li>
          <code>offline_access</code> — to obtain a refresh token so you are not
          asked to sign in every 30 minutes.
        </li>
      </ul>

      <h2>4. What we send to Groq</h2>
      <p>
        Categorising an email and drafting a reply requires a language model.
        Mr Mailer uses <strong>Groq</strong> for this. The following text is
        sent to Groq over an encrypted connection:
      </p>
      <ul>
        <li>
          The email&apos;s subject, its sender, and up to <strong>4,000
          characters</strong> of the email body, together with a short note
          describing how you have previously classified that sender, if any.
        </li>
        <li>
          For meeting minutes you paste in: the title, the attendees you typed,
          and up to <strong>8,000 characters</strong> of your notes.
        </li>
        <li>
          To keep the drafts in your voice, up to <strong>30 samples</strong> of
          replies you have actually sent alongside the draft Mr Mailer
          suggested, each clipped to 1,200 characters.
        </li>
      </ul>
      <p>
        Groq produces the priority, summary and suggested reply from that input
        and returns them to us. Groq is the only AI service Mr Mailer sends your
        mail content to. Groq does not have access to your mailbox — it never
        receives your credentials, and it only sees the specific text described
        above.
      </p>

      <h2>5. What we store, and how it is protected</h2>
      <p>Mr Mailer stores, in a MySQL database operated by our hosting provider:</p>
      <ul>
        <li>Your name, email address, and the provider ID from your sign-in.</li>
        <li>
          Your Google or Microsoft access and refresh tokens, and their scopes.
        </li>
        <li>
          For each summarised message: the subject, sender, the AI summary, the
          suggested reply, its priority and status, and the plain-text body of
          the original message.
        </li>
        <li>
          The replies you sent and the drafts that preceded them, plus counts of
          what you changed — this is what the writing-style profile learns from.
        </li>
        <li>
          Your writing-style profile, meeting minutes you paste in, meeting
          reminders, schedule blocks, and per-sender preferences.
        </li>
        <li>
          Job failure records: the name of the background job, the step it
          failed on, and the error message. These are visible to the operator
          for debugging.
        </li>
      </ul>
      <p>Protection as implemented:</p>
      <ul>
        <li>
          All traffic between your browser and Mr Mailer is served over HTTPS.
        </li>
        <li>
          <strong>OAuth access and refresh tokens are encrypted at the
          application layer</strong> with AES-256-GCM, using a key derived from
          a server secret.
        </li>
        <li>
          Your session is a signed token in an <code>HttpOnly</code>,{" "}
          <code>SameSite=Lax</code> cookie that expires after 30 minutes of
          inactivity.
        </li>
        <li>
          Access to the database and to Redis is limited to the application
          servers running Mr Mailer.
        </li>
      </ul>
      <p>
        <strong>What is not protected that way:</strong> email bodies, summaries,
        suggested and sent replies, and your writing-style profile are stored as{" "}
        <strong>plain text</strong> in the database. Mr Mailer does not encrypt
        them itself beyond whatever our database provider does at rest.
      </p>

      <h2>6. What we do not do</h2>
      <ul>
        <li>We do <strong>not sell</strong> your data, or share it with anyone for their own use.</li>
        <li>We do <strong>not use your data for advertising</strong>, and there are no advertising partners.</li>
        <li>
          We do <strong>not run analytics, tracking or error-monitoring
          scripts</strong>. There is no third-party analytics on this site, and
          no tracking cookies of any kind.
        </li>
        <li>
          We do <strong>not read your mail</strong>. No human sees the content
          of your emails, summaries or drafts — except where you specifically
          ask us to (for example, if you write to support about a bug and paste
          something in) or where we are required to by law.
        </li>
        <li>
          We do <strong>not use your mail content to train models</strong>. It
          is sent to Groq to produce your summaries and drafts, and nothing
          else.
        </li>
        <li>
          We do <strong>not forward, share or export</strong> your mailbox
          anywhere other than the provider APIs you authorised and Groq as
          described above.
        </li>
        <li>
          Mr Mailer does <strong>not send mail on your behalf</strong> except
          replies you have written or approved, and the optional weekly summary
          to your own address if you turn it on.
        </li>
      </ul>

      <h2>7. Cookies and local storage</h2>
      <p>
        Mr Mailer sets exactly one cookie: <code>__session</code>, which holds
        your signed-in session. It is <code>HttpOnly</code> so scripts cannot
        read it, <code>SameSite=Lax</code>, sent only over HTTPS in production,
        and expires after 30 minutes of inactivity.
      </p>
      <p>
        Your theme choice and the once-a-day dismissal of the activity ticker
        are kept in your browser&apos;s <code>localStorage</code>. That data
        stays on your device and is never sent to us.
      </p>

      <h2>8. Retention</h2>
      <p>
        Summarised emails and job failure records are deleted automatically
        after <strong>{retentionDays} days</strong> (configurable per
        deployment as <code>RETENTION_DAYS</code>; the default is 90). The
        cleanup runs once a day.
      </p>
      <p>
        Automatic retention cleanup does <strong>not</strong> currently cover
        your account credentials, sender preferences, reply drafts and sent
        replies, writing-style profile, meeting minutes, or schedule blocks.
        Those are kept until you delete your account, which removes all of them.
        We would rather say that plainly than imply a shorter retention period
        than the one enforced.
      </p>

      <h2>9. Deleting your data</h2>
      <p>
        <strong>In the app:</strong> go to <strong>Settings</strong> and choose{" "}
        <strong>Delete my account</strong>. You will be asked to type your email
        address to confirm. This removes every row associated with your account,
        cancels any queued background jobs, revokes your Google token, and signs
        you out.
      </p>
      <p>
        <strong>Revoking Google access on Google&apos;s side:</strong> visit{" "}
        <a href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a>{" "}
        and remove Mr Mailer. Doing this first means the app can no longer read
        your mail even before you delete the account here.
      </p>
      <p>
        <strong>Microsoft:</strong> Mr Mailer cannot revoke your Microsoft
        consent on your behalf. Remove it yourself at{" "}
        <a href="https://account.microsoft.com/privacy">account.microsoft.com</a>{" "}
        under <em>Apps and services</em>.
      </p>
      <p>
        <strong>Or ask us:</strong> write to{" "}
        <a href={`mailto:${contact}`}>{contact}</a> from the address on the
        account and we will delete it.
      </p>

      <h2>10. Google Limited Use disclosure</h2>
      <p>
        {operator}&apos;s use and transfer to any other app of information
        received from Google APIs will adhere to the{" "}
        <a href="https://developers.google.com/terms/api-services-user-data-policy">
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements.
      </p>

      <h2>11. Changes to this policy</h2>
      <p>
        When the behaviour of the software changes, this document changes with
        it. The effective date at the top is updated whenever it does.
      </p>

      <h2>12. Contact</h2>
      <p>
        Privacy questions, data access requests and deletion requests:{" "}
        <a href={`mailto:${contact}`}>{contact}</a>
      </p>
      <p>
        Operator: <strong>{operator}</strong>
      </p>
    </>
  );
}
