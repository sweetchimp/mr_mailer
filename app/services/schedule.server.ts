import { prisma } from "../lib/prisma.server";
import { sendScheduleReminderEmail } from "./reminder.server";

export function getLocalDayKey(offsetDays = 0): Date {
  const now = new Date();
  const local = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  local.setDate(local.getDate() + offsetDays);
  return new Date(
    Date.UTC(local.getFullYear(), local.getMonth(), local.getDate()),
  );
}

export interface ScheduleCheckResult {
  usersChecked: number;
  remindersSent: number;
  started: number;
  missed: number;
  rolledOver: number;
  errors: { userId: string; error: string }[];
}

export async function checkScheduleBlocks(): Promise<ScheduleCheckResult> {
  const result: ScheduleCheckResult = {
    usersChecked: 0,
    remindersSent: 0,
    started: 0,
    missed: 0,
    rolledOver: 0,
    errors: [],
  };

  const today = getLocalDayKey();
  const now = new Date();

  const blocks = await prisma.scheduleBlock.findMany({
    where: {
      status: { in: ["PENDING", "IN_PROGRESS"] },
      date: { lte: today },
    },
    select: {
      id: true,
      userId: true,
      title: true,
      startTime: true,
      endTime: true,
      status: true,
      date: true,
      user: { select: { email: true, tokenRevokedAt: true } },
    },
  });

  const userIds = new Set(blocks.map((b) => b.userId));
  result.usersChecked = userIds.size;

  for (const block of blocks) {
    try {
      if (block.date.getTime() < today.getTime()) {
        const rolledOver = await prisma.scheduleBlock.updateMany({
          where: {
            id: block.id,
            status: { in: ["PENDING", "IN_PROGRESS"] },
          },
          data: { status: "MISSED" },
        });
        result.rolledOver += rolledOver.count;
        continue;
      }

      if (block.status === "PENDING" && block.startTime.getTime() <= now.getTime()) {
        if (block.user.tokenRevokedAt) {
          result.errors.push({
            userId: block.userId,
            error: "Token revoked — schedule reminder skipped",
          });
        } else {
          await sendScheduleReminderEmail(block.user.email, block.title);
          result.remindersSent++;
        }

        const started = await prisma.scheduleBlock.updateMany({
          where: { id: block.id, status: "PENDING" },
          data: { status: "IN_PROGRESS" },
        });
        result.started += started.count;
        continue;
      }

      if (block.status === "IN_PROGRESS" && block.endTime.getTime() <= now.getTime()) {
        const missed = await prisma.scheduleBlock.updateMany({
          where: { id: block.id, status: "IN_PROGRESS" },
          data: { status: "MISSED" },
        });
        result.missed += missed.count;
      }
    } catch (error) {
      result.errors.push({
        userId: block.userId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}
