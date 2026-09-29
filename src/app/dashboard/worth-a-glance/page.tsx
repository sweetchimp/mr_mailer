import { requireUser } from "@/lib/current-session.server";
import { getBucketEmails } from "@/services/dashboard.server";
import { getUnsubscribeNotices } from "@/services/sender-preference.server";
import { BucketShell } from "@/components/bucket-shell";
import { EmailList } from "@/components/email-list";

export default async function WorthAGlancePage() {
  const user = await requireUser();
  const [emails, unsubscribeNotices] = await Promise.all([
    getBucketEmails(user.id, "worth-a-glance"),
    getUnsubscribeNotices(user.id),
  ]);

  return (
    <BucketShell bucket="worth-a-glance" count={emails.length}>
      <EmailList emails={emails} selectable unsubscribeNotices={unsubscribeNotices} />
    </BucketShell>
  );
}
