import { getValidAccessToken } from "../lib/google-auth.server";

export async function sendReminderEmail(
  userEmail: string,
  subject: string,
  sender: string,
): Promise<void> {
  const accessToken = await getValidAccessTokenByEmail(userEmail);

  const reminderBody = [
    `Hi,`,
    ``,
    `This is a reminder about an email you snoozed:`,
    ``,
    `  From: ${sender}`,
    `  Subject: ${subject}`,
    ``,
    `Open Mr Mailer to take action.`,
  ].join("\r\n");

  const rawMessage = [
    `To: ${userEmail}`,
    `Subject: Reminder: ${subject}`,
    `Content-Type: text/plain; charset=utf-8`,
    ``,
    reminderBody,
  ].join("\r\n");

  const encodedMessage = Buffer.from(rawMessage)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const sendRes = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw: encodedMessage }),
    },
  );

  if (!sendRes.ok) {
    const errorText = await sendRes.text();
    throw new Error(`Gmail API error sending reminder: ${sendRes.status} ${errorText}`);
  }
}

async function getValidAccessTokenByEmail(email: string): Promise<string> {
  const { prisma } = await import("../lib/prisma.server");
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error("User not found");
  return getValidAccessToken(user.id);
}
