import { requireUser } from "@/lib/current-session.server";
import { getBucketEmails } from "@/services/dashboard.server";
import { getUnsubscribeNotices } from "@/services/sender-preference.server";
import { BucketShell } from "@/components/bucket-shell";
import { EmailList } from "@/components/email-list";

export default async function FyiPage() {
  const user = await requireUser();
  const [emails, unsubscribeNotices] = await Promise.all([
    getBucketEmails(user.id, "fyi"),
    getUnsubscribeNotices(user.id),
  ]);

  return (
    <BucketShell bucket="fyi" count={emails.length}>
      <EmailList emails={emails} selectable unsubscribeNotices={unsubscribeNotices} />
    </BucketShell>
  );
}
