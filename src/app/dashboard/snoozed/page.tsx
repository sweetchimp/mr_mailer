import { requireUser } from "@/lib/current-session.server";
import { getBucketEmails } from "@/services/dashboard.server";
import { BucketShell } from "@/components/bucket-shell";
import { SnoozedList } from "@/components/email-list";

export default async function SnoozedPage() {
  const user = await requireUser();
  const emails = await getBucketEmails(user.id, "snoozed");

  return (
    <BucketShell bucket="snoozed" count={emails.length}>
      <SnoozedList emails={emails} />
    </BucketShell>
  );
}
