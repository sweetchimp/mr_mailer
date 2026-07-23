import { prisma } from "../lib/prisma.server";
import { computeReplyDiff } from "../lib/diff.server";

interface StoreFeedbackParams {
  emailId: string;
  userId: string;
  generatedReply: string;
  finalReply: string;
}

export async function storeReplyFeedback(
  params: StoreFeedbackParams,
): Promise<void> {
  const { emailId, userId, generatedReply, finalReply } = params;

  const diff = computeReplyDiff(generatedReply, finalReply);

  await prisma.replyFeedback.create({
    data: {
      emailId,
      userId,
      generatedReply,
      finalReply,
      insertions: diff.insertions,
      deletions: diff.deletions,
      modifications: diff.modifications,
    },
  });
}
