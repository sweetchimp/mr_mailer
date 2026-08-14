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

export async function sendMeetingReminderEmail(
  userEmail: string,
  title: string,
  meetingTime: Date,
): Promise<void> {
  const accessToken = await getValidAccessTokenByEmail(userEmail);

  const timeStr = meetingTime.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const reminderBody = [
    `Hi,`,
    ``,
    `Reminder: you have an upcoming meeting.`,
    ``,
    `  ${title}`,
    `  ${timeStr}`,
    ``,
    `See you there.`,
  ].join("\r\n");

  const rawMessage = [
    `To: ${userEmail}`,
    `Subject: Upcoming meeting: ${title}`,
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
    throw new Error(`Gmail API error sending meeting reminder: ${sendRes.status} ${errorText}`);
  }
}

export async function sendScheduleReminderEmail(
  userEmail: string,
  title: string,
): Promise<void> {
  const accessToken = await getValidAccessTokenByEmail(userEmail);

  const reminderBody = [
    `Hi,`,
    ``,
    `Time for: ${title}`,
    ``,
    `Open Mr Mailer to check it off your schedule.`,
  ].join("\r\n");

  const rawMessage = [
    `To: ${userEmail}`,
    `Subject: Time for: ${title}`,
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
    throw new Error(`Gmail API error sending schedule reminder: ${sendRes.status} ${errorText}`);
  }
}

async function getValidAccessTokenByEmail(email: string): Promise<string> {
  const { prisma } = await import("../lib/prisma.server");
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error("User not found");

  const token = await prisma.oAuthToken.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: { provider: true },
  });

  if (token?.provider === "MICROSOFT") {
    const { getMicrosoftAccessToken } = await import("../lib/microsoft-auth.server");
    return getMicrosoftAccessToken(user.id);
  }

  return getValidAccessToken(user.id);
}
