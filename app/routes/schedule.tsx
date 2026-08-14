import { useState } from "react";
import { Form, redirect, Link } from "react-router";
import { authMiddleware } from "../middleware/auth.server";
import { withSessionCookie } from "../lib/session.server";
import { prisma } from "../lib/prisma.server";
import { userContext } from "../context";
import { getLocalDayKey } from "../services/schedule.server";
import type { Route } from "./+types/schedule";

export const middleware = [authMiddleware];

type ScheduleStatus = "PENDING" | "IN_PROGRESS" | "DONE" | "MISSED";

interface Block {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  status: ScheduleStatus;
}

function parseTimeToDate(time: string, day: Date): Date {
  const [hours, minutes] = time.split(":").map((part) => Number(part) || 0);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours, minutes);
}

function toTimeInputValue(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export async function loader({ context }: Route.LoaderArgs) {
  const user = context.get(userContext)!;

  const blocks = await prisma.scheduleBlock.findMany({
    where: { userId: user.id, date: getLocalDayKey() },
    orderBy: { startTime: "asc" },
    select: { id: true, title: true, startTime: true, endTime: true, status: true },
  });

  const data = {
    blocks: blocks.map((block) => ({
      id: block.id,
      title: block.title,
      startTime: block.startTime.toISOString(),
      endTime: block.endTime.toISOString(),
      status: block.status,
    })),
  };

  return withSessionCookie(data as unknown as Record<string, unknown>, context) as unknown as typeof data;
}

export async function action({ request, context }: Route.ActionArgs) {
  const user = context.get(userContext)!;
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  const validateFields = () => {
    const title = String(formData.get("title") ?? "").trim();
    const startTimeRaw = String(formData.get("startTime") ?? "");
    const endTimeRaw = String(formData.get("endTime") ?? "");
    if (!title || !startTimeRaw || !endTimeRaw) {
      return { error: "A title, start time, and end time are required." as const };
    }
    const startTime = parseTimeToDate(startTimeRaw, new Date());
    const endTime = parseTimeToDate(endTimeRaw, new Date());
    if (endTime <= startTime) {
      return { error: "End time must be after the start time." as const };
    }
    return { title, startTime, endTime };
  };

  if (intent === "create") {
    const fields = validateFields();
    if ("error" in fields) {
      return withSessionCookie({ error: fields.error }, context);
    }
    await prisma.scheduleBlock.create({
      data: {
        userId: user.id,
        title: fields.title,
        startTime: fields.startTime,
        endTime: fields.endTime,
        date: getLocalDayKey(),
      },
    });
    throw redirect("/schedule");
  }

  const id = String(formData.get("id") ?? "");
  if (!id) {
    return withSessionCookie({ error: "Missing block id." }, context);
  }
  const where = { id, userId: user.id };

  if (intent === "done") {
    await prisma.scheduleBlock.updateMany({ where, data: { status: "DONE" } });
    throw redirect("/schedule");
  }

  if (intent === "delete") {
    await prisma.scheduleBlock.deleteMany({ where });
    throw redirect("/schedule");
  }

  if (intent === "edit") {
    const fields = validateFields();
    if ("error" in fields) {
      return withSessionCookie({ error: fields.error }, context);
    }
    await prisma.scheduleBlock.updateMany({
      where,
      data: { title: fields.title, startTime: fields.startTime, endTime: fields.endTime },
    });
    throw redirect("/schedule");
  }

  return withSessionCookie({ error: "Invalid intent." }, context);
}

const STATUS_STYLES: Record<ScheduleStatus, { bg: string; text: string; line: string }> = {
  PENDING: {
    bg: "var(--color-card)",
    text: "var(--color-ink-soft)",
    line: "var(--color-line)",
  },
  IN_PROGRESS: {
    bg: "var(--color-priority-medium-bg)",
    text: "var(--color-priority-medium-text)",
    line: "var(--color-priority-medium-line)",
  },
  DONE: {
    bg: "var(--color-priority-low-bg)",
    text: "var(--color-priority-low-text)",
    line: "var(--color-priority-low-line)",
  },
  MISSED: {
    bg: "var(--color-priority-high-bg)",
    text: "var(--color-priority-high-text)",
    line: "var(--color-priority-high-line)",
  },
};

function BlockModal({
  mode,
  block,
  error,
  onDismiss,
}: {
  mode: "create" | "edit";
  block?: Block;
  error?: string;
  onDismiss: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0"
        style={{ background: "rgba(0,0,0,0.6)" }}
        onClick={onDismiss}
      />
      <div
        className="relative mx-4 w-full max-w-md rounded-[10px] p-6"
        style={{
          background: "var(--color-card)",
          boxShadow: "0 25px 60px rgba(0,0,0,0.3)",
        }}
      >
        <p
          className="mb-4 text-[11px] uppercase tracking-[0.15em]"
          style={{ fontFamily: "var(--font-mono)", color: "var(--color-ink-faint)" }}
        >
          {mode === "create" ? "Add a block" : "Edit block"}
        </p>

        {error && (
          <p
            className="mb-4 rounded-md border-l-[3px] p-3 text-sm"
            style={{
              background: "var(--color-priority-high-bg)",
              borderLeftColor: "var(--color-priority-high-line)",
              color: "var(--color-priority-high-text)",
              fontFamily: "var(--font-body)",
            }}
          >
            {error}
          </p>
        )}

        <Form method="post" className="space-y-4">
          <input type="hidden" name="intent" value={mode} />
          {block && <input type="hidden" name="id" value={block.id} />}

          <div>
            <label
              htmlFor="title"
              className="mb-1 block text-[12px] font-medium"
              style={{ fontFamily: "var(--font-mono)", color: "var(--color-ink-soft)" }}
            >
              Title
            </label>
            <input
              id="title"
              name="title"
              type="text"
              required
              defaultValue={block?.title ?? ""}
              placeholder="e.g. Deep work on the proposal"
              className="w-full rounded-md px-3 py-2 text-sm"
              style={{
                background: "var(--color-card)",
                border: "1px solid var(--color-line)",
                color: "var(--color-ink)",
                fontFamily: "var(--font-body)",
              }}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="startTime"
                className="mb-1 block text-[12px] font-medium"
                style={{ fontFamily: "var(--font-mono)", color: "var(--color-ink-soft)" }}
              >
                Start
              </label>
              <input
                id="startTime"
                name="startTime"
                type="time"
                required
                defaultValue={block ? toTimeInputValue(block.startTime) : "09:00"}
                className="w-full rounded-md px-3 py-2 text-sm"
                style={{
                  background: "var(--color-card)",
                  border: "1px solid var(--color-line)",
                  color: "var(--color-ink)",
                  fontFamily: "var(--font-mono)",
                }}
              />
            </div>
            <div>
              <label
                htmlFor="endTime"
                className="mb-1 block text-[12px] font-medium"
                style={{ fontFamily: "var(--font-mono)", color: "var(--color-ink-soft)" }}
              >
                End
              </label>
              <input
                id="endTime"
                name="endTime"
                type="time"
                required
                defaultValue={block ? toTimeInputValue(block.endTime) : "10:00"}
                className="w-full rounded-md px-3 py-2 text-sm"
                style={{
                  background: "var(--color-card)",
                  border: "1px solid var(--color-line)",
                  color: "var(--color-ink)",
                  fontFamily: "var(--font-mono)",
                }}
              />
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary w-full px-6 py-3 text-sm"
            style={{ fontFamily: "var(--font-body)" }}
          >
            {mode === "create" ? "Add block" : "Save changes"}
          </button>
        </Form>
      </div>
    </div>
  );
}

export default function Schedule({ loaderData, actionData }: Route.ComponentProps) {
  const { blocks } = loaderData as { blocks: Block[] };
  const error = (actionData as { error?: string } | undefined)?.error;
  const [modalOpen, setModalOpen] = useState<"create" | "edit" | null>(null);
  const [editingBlock, setEditingBlock] = useState<Block | undefined>(undefined);

  const doneCount = blocks.filter((block) => block.status === "DONE").length;

  const openEdit = (block: Block) => {
    setEditingBlock(block);
    setModalOpen("edit");
  };

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      {modalOpen && (
        <BlockModal
          mode={modalOpen}
          block={modalOpen === "edit" ? editingBlock : undefined}
          error={error}
          onDismiss={() => setModalOpen(null)}
        />
      )}

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2
            className="text-[11px] uppercase tracking-[0.15em]"
            style={{ fontFamily: "var(--font-mono)", color: "var(--color-ink-faint)" }}
          >
            Daily schedule
          </h2>
          <p
            className="mt-1 text-sm"
            style={{ fontFamily: "var(--font-body)", color: "var(--color-ink-soft)" }}
          >
            {blocks.length === 0
              ? "No blocks for today yet."
              : `${doneCount} of ${blocks.length} blocks done today.`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/dashboard"
            className="btn btn-link text-[13px]"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            &larr; Dashboard
          </Link>
          <button
            type="button"
            onClick={() => setModalOpen("create")}
            className="btn btn-primary shrink-0 px-4 py-2 text-sm"
            style={{ fontFamily: "var(--font-body)" }}
          >
            + Add block
          </button>
        </div>
      </div>

      {error && !modalOpen && (
        <p
          className="mb-4 rounded-md border-l-[3px] p-3 text-sm"
          style={{
            background: "var(--color-priority-high-bg)",
            borderLeftColor: "var(--color-priority-high-line)",
            color: "var(--color-priority-high-text)",
            fontFamily: "var(--font-body)",
          }}
        >
          {error}
        </p>
      )}

      {blocks.length === 0 ? (
        <div className="rounded-xl p-8 text-center" style={{ border: "1px solid var(--color-line)" }}>
          <p
            className="text-sm"
            style={{ fontFamily: "var(--font-body)", color: "var(--color-ink-faint)" }}
          >
            Nothing planned yet. Add your first block to start time-blocking your day.
          </p>
        </div>
      ) : (
        <ol className="relative space-y-3 pl-5">
          <span
            className="absolute bottom-2 left-[7px] top-2 w-px"
            style={{ background: "var(--color-line)" }}
          />
          {blocks.map((block) => {
            const status = STATUS_STYLES[block.status];
            return (
              <li
                key={block.id}
                className="relative flex items-center gap-4 rounded-xl p-4"
                style={{
                  background: status.bg,
                  border: `1px solid ${status.line}`,
                }}
              >
                <span
                  className="absolute -left-5 top-1/2 h-[7px] w-[7px] -translate-y-1/2 rounded-full"
                  style={{ background: status.line }}
                />
                <div className="min-w-0 flex-1">
                  <p
                    className="truncate text-sm font-medium"
                    style={{ fontFamily: "var(--font-body)", color: "var(--color-ink)" }}
                  >
                    {block.title}
                  </p>
                  <p
                    className="mt-0.5 text-[12px]"
                    style={{ fontFamily: "var(--font-mono)", color: status.text }}
                  >
                    {formatTime(block.startTime)} &ndash; {formatTime(block.endTime)}
                  </p>
                </div>
                <span
                  className="shrink-0 rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.1em]"
                  style={{
                    fontFamily: "var(--font-mono)",
                    color: status.text,
                    border: `1px solid ${status.line}`,
                    background: "var(--color-card)",
                  }}
                >
                  {block.status === "IN_PROGRESS" ? "In progress" : block.status.toLowerCase()}
                </span>
                <div className="flex shrink-0 items-center gap-2">
                  {block.status !== "DONE" && (
                    <Form method="post">
                      <input type="hidden" name="intent" value="done" />
                      <input type="hidden" name="id" value={block.id} />
                      <button
                        type="submit"
                        className="btn btn-soft px-3 py-1.5 text-[12px]"
                        style={{ fontFamily: "var(--font-mono)" }}
                      >
                        Done
                      </button>
                    </Form>
                  )}
                  <button
                    type="button"
                    onClick={() => openEdit(block)}
                    className="btn btn-outline px-3 py-1.5 text-[12px]"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    Edit
                  </button>
                  <Form method="post">
                    <input type="hidden" name="intent" value="delete" />
                    <input type="hidden" name="id" value={block.id} />
                    <button
                      type="submit"
                      className="btn btn-danger px-3 py-1.5 text-[12px]"
                      style={{ fontFamily: "var(--font-mono)" }}
                    >
                      Delete
                    </button>
                  </Form>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </main>
  );
}
