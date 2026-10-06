import type { Metadata } from "next";
import { getContactEmail, getOperatorName } from "@/lib/env.server";

export const metadata: Metadata = {
  title: "Terms of Service — Mr Mailer",
  description:
    "The terms that apply when you use Mr Mailer to read, summarise and reply to your email.",
};

export const dynamic = "force-dynamic";

export default function TermsPage() {
  const operator = getOperatorName();
  const contact = getContactEmail();

  return (
    <>
      <h1>Terms of Service</h1>
      <p className="lede">
        Effective 6 October 2026. These terms are between you and {operator}
        , the operator of Mr Mailer. By signing in you agree to them.
      </p>

      <h2>1. The service</h2>
      <p>
        Mr Mailer reads recent email from your Google or Microsoft account,
        categorises it, summarises it, and drafts replies. You choose what to
        act on. The service is provided as-is and may change or be withdrawn.
      </p>

      <h2>2. Your account and the access you grant</h2>
      <p>
        You sign in through Google or Microsoft and grant Mr Mailer the mail and
        calendar permissions listed in the{" "}
        <a href="/privacy">privacy policy</a>. You are responsible for your
        account and for keeping your own sign-in credentials secret — Mr Mailer
        never sees or stores your Google or Microsoft password.
      </p>
      <p>
        You may withdraw that access at any time, either by deleting your Mr
        Mailer account or by removing the app from your Google or Microsoft
        account permissions page.
      </p>

      <h2>3. Acceptable use</h2>
      <p>You must not use Mr Mailer to:</p>
      <ul>
        <li>send spam, unsolicited bulk mail, or abusive messages;</li>
        <li>impersonate another person or misrepresent who you are;</li>
        <li>violate the law or the rights of others;</li>
        <li>attempt to disrupt, probe or reverse-engineer the service;</li>
        <li>
          resell or redistribute the service without written permission from{" "}
          {operator}.
        </li>
      </ul>

      <h2>4. AI-generated content</h2>
      <p>
        Summaries, priorities and draft replies are produced by an automated
        language model. <strong>They can be wrong.</strong> A draft may
        misread tone, get a detail out of sequence, or invent something that
        was not in the original message.
      </p>
      <p>
        Mr Mailer is built around that: nothing is sent without you reviewing
        and sending it yourself. You are responsible for what you send, and you
        should check any AI-assisted reply before it leaves your mailbox.
        Nothing in this section limits the liability exclusions below.
      </p>

      <h2>5. Your mail stays yours</h2>
      <p>
        You retain all rights to your email and to the messages you send. You
        grant {operator} only the limited permission needed to operate the
        service for you — to read what is described in the privacy policy, to
        store what it produces, and to send what you approve. That permission
        ends when you delete your account.
      </p>

      <h2>6. Availability</h2>
      <p>
        We do not guarantee uninterrupted availability. Mr Mailer depends on
        Google, Microsoft, Groq and our hosting provider, any of which may be
        slow or unavailable. Background jobs may be delayed or may fail; failed
        jobs are recorded so they can be investigated.
      </p>

      <h2>7. Termination</h2>
      <p>
        You may stop using Mr Mailer at any time by deleting your account from
        Settings, which removes your data as described in the privacy policy.
        We may suspend or terminate access if these terms are broken, in which
        case we will remove your data in line with the privacy policy.
      </p>

      <h2>8. Disclaimer and limitation of liability</h2>
      <p>
        To the fullest extent permitted by law, Mr Mailer is provided without
        warranties of any kind, express or implied, including fitness for a
        particular purpose. To the fullest extent permitted by law,{" "}
        {operator} will not be liable for indirect, incidental or consequential
        damages, or for loss of data or profits arising from your use of the
        service.
      </p>

      <h2>9. Governing law</h2>
      <p>
        These terms are governed by the laws applicable where {operator} is
        established, without regard to conflict-of-law rules. If any provision
        is found unenforceable, the rest remains in effect.
      </p>

      <h2>10. Contact</h2>
      <p>
        Questions about these terms: <a href={`mailto:${contact}`}>{contact}</a>
      </p>
      <p>
        Operator: <strong>{operator}</strong>
      </p>
    </>
  );
}
