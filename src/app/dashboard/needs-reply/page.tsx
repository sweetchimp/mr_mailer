import { requireUser } from "@/lib/current-session.server";
import { getBucketEmails } from "@/services/dashboard.server";
import { BucketShell } from "@/components/bucket-shell";
import { EmailList } from "@/components/email-list";

export default async function NeedsReplyPage() {
  const user = await requireUser();
  const emails = await getBucketEmails(user.id, "needs-reply");

  return (
    <BucketShell bucket="needs-reply" count={emails.length}>
      <EmailList emails={emails} />
    </BucketShell>
  );
}
