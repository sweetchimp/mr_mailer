import { requireUser } from "@/lib/current-session.server";
import { getBucketEmails } from "@/services/dashboard.server";
import { getUnsubscribeNotices } from "@/services/sender-preference.server";
import { BucketShell } from "@/components/bucket-shell";
import { EmailList } from "@/components/email-list";

export default async function NeedsReplyPage() {
  const user = await requireUser();
  // No `selectable`: an email the AI flagged as needing a reply is the one case
  // where a single mis-tap discarding six of them would be genuinely costly.
  const [emails, unsubscribeNotices] = await Promise.all([
    getBucketEmails(user.id, "needs-reply"),
    getUnsubscribeNotices(user.id),
  ]);

  return (
    <BucketShell bucket="needs-reply" count={emails.length}>
      <EmailList emails={emails} unsubscribeNotices={unsubscribeNotices} />
    </BucketShell>
  );
}
