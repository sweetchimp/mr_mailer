"use client";

import { useState, useTransition } from "react";
import { deleteAccountAction } from "@/app/settings/actions";

/**
 * The confirmation gate for account deletion.
 *
 * The typed address is the whole check: a checkbox or a "yes, I'm sure" button
 * is satisfied by a reflex, whereas reproducing the address on the account
 * takes a deliberate look at what is about to disappear. It is verified again
 * server-side — this component decides when the button is usable, the action
 * decides whether the deletion happens.
 */
export function DeleteAccountForm({
  userEmail,
  provider,
}: {
  userEmail: string;
  provider: "GOOGLE" | "MICROSOFT";
}) {
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const matches = typed.trim() === userEmail;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!matches || isPending) return;

    const formData = new FormData(event.currentTarget);
    setError(null);

    startTransition(async () => {
      const result = await deleteAccountAction(formData);
      if (!result.ok) {
        setError(result.error ?? "Could not delete the account.");
      }
    });
  };

  return (
    <div
      className="rounded-xl p-5"
      style={{
        background: "var(--color-priority-high-bg)",
        border: "1px solid var(--color-priority-high-line)",
      }}
    >
      <h2
        className="text-[15px] font-semibold"
        style={{
          fontFamily: "var(--font-body)",
          color: "var(--color-priority-high-text)",
        }}
      >
        Delete my account
      </h2>
      <p
        className="mt-2 text-[13px] leading-[1.65]"
        style={{ fontFamily: "var(--font-body)", color: "var(--color-ink-soft)" }}
      >
        This permanently removes your account, every summarised email, your
        stored replies and writing-style profile, meeting minutes, sender
        preferences and job records, cancels any queued background jobs, and
        signs you out. Your Google token is revoked as part of the process.{" "}
        <strong style={{ color: "var(--color-ink)" }}>
          It cannot be undone.
        </strong>
      </p>

      {provider === "MICROSOFT" && (
        <div
          className="mt-4 rounded-lg p-3"
          style={{
            background: "var(--color-surface)",
            border: "1px solid var(--color-line)",
          }}
        >
          <p
            className="text-[13px] leading-[1.65]"
            style={{ fontFamily: "var(--font-body)", color: "var(--color-ink-soft)" }}
          >
            <strong style={{ color: "var(--color-ink)" }}>
              One extra step for Microsoft:
            </strong>{" "}
            Mr Mailer cannot revoke your Microsoft consent on your behalf. After
            deleting here, go to{" "}
            <a
              href="https://account.microsoft.com"
              target="_blank"
              rel="noreferrer"
              className="underline"
              style={{ color: "var(--color-brand-blue)" }}
            >
              account.microsoft.com
            </a>{" "}
            → <em>Apps and services</em> and remove Mr Mailer, so the permission
            itself is withdrawn too.
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-4">
        <label
          htmlFor="confirmedEmail"
          className="block text-[13px]"
          style={{ fontFamily: "var(--font-body)", color: "var(--color-ink-soft)" }}
        >
          Type <strong style={{ color: "var(--color-ink)" }}>{userEmail}</strong>{" "}
          to confirm
        </label>
        <input
          id="confirmedEmail"
          name="confirmedEmail"
          type="text"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          value={typed}
          onChange={(event) => {
            setTyped(event.target.value);
            setError(null);
          }}
          placeholder={userEmail}
          className="mt-2 w-full rounded-lg px-3 py-2.5 text-[14px] outline-none"
          style={{
            fontFamily: "var(--font-mono)",
            background: "var(--color-surface)",
            border: "1px solid var(--color-line)",
            color: "var(--color-ink)",
            minWidth: 0,
          }}
        />

        {error && (
          <p
            role="alert"
            className="mt-2 text-[13px]"
            style={{
              fontFamily: "var(--font-body)",
              color: "var(--color-priority-high-text)",
            }}
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={!matches || isPending}
          className="btn btn-danger mt-4 w-full px-5 py-3 text-sm"
          style={{ fontFamily: "var(--font-body)" }}
        >
          {isPending ? "Deleting…" : "Delete my account"}
        </button>
      </form>
    </div>
  );
}
