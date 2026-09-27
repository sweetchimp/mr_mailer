import { requireUser } from "@/lib/current-session.server";
import { getBucketEmails } from "@/services/dashboard.server";
import { BucketShell } from "@/components/bucket-shell";
import { EmailList } from "@/components/email-list";

export default async function WorthAGlancePage() {
  const user = await requireUser();
  const emails = await getBucketEmails(user.id, "worth-a-glance");

  return (
    <BucketShell bucket="worth-a-glance" count={emails.length}>
      <EmailList emails={emails} />
    </BucketShell>
  );
}
