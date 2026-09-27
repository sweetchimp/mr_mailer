"use client";

import { useEffect, useState } from "react";

const VERSES = [
  { text: "Be still, and know that I am God.", ref: "Psalm 46:10" },
  {
    text: "The Lord is my shepherd; I shall not want. He makes me lie down in green pastures.",
    ref: "Psalm 23:1-2",
  },
  {
    text: "Trust in the Lord with all your heart, and do not lean on your own understanding.",
    ref: "Proverbs 3:5",
  },
  {
    text: "For I know the plans I have for you, declares the Lord, plans for welfare and not for evil, to give you a future and a hope.",
    ref: "Jeremiah 29:11",
  },
  {
    text: "The steadfast love of the Lord never ceases; his mercies never come to an end; they are new every morning.",
    ref: "Lamentations 3:22-23",
  },
  {
    text: "Come to me, all who labor and are heavy laden, and I will give you rest.",
    ref: "Matthew 11:28",
  },
  { text: "I can do all things through him who strengthens me.", ref: "Philippians 4:13" },
  {
    text: "The Lord will fight for you, and you have only to be silent.",
    ref: "Exodus 14:14",
  },
  {
    text: "He who began a good work in you will carry it on to completion.",
    ref: "Philippians 1:6",
  },
  {
    text: "This is the day that the Lord has made; let us rejoice and be glad in it.",
    ref: "Psalm 118:24",
  },
];

function getDayOfYear(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function todayKey(): string {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `mr-mailer-verse-${d.getFullYear()}-${month}-${day}`;
}

export function VerseModal() {
  // Start hidden so the server and first client render agree; the effect below
  // reveals it if today's verse hasn't been dismissed yet.
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(todayKey())) setOpen(true);
    } catch {
      // storage unavailable — skip the modal rather than trap the user
    }
  }, []);

  const dismiss = () => {
    setOpen(false);
    try {
      localStorage.setItem(todayKey(), "1");
    } catch {
      // ignore
    }
  };

  if (!open) return null;

  const verse = VERSES[getDayOfYear() % VERSES.length];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0"
        style={{ background: "rgba(0,0,0,0.6)" }}
        onClick={dismiss}
      />
      <div
        className="relative mx-4 w-full max-w-md rounded-[10px] p-8 text-center"
        style={{
          background: "var(--color-card)",
          boxShadow: "0 25px 60px rgba(0,0,0,0.3)",
        }}
      >
        <p
          className="mb-4 text-[11px] uppercase tracking-[0.15em]"
          style={{ fontFamily: "var(--font-mono)", color: "var(--color-ink-faint)" }}
        >
          Today&apos;s verse
        </p>
        <p
          className="mb-3 text-lg leading-relaxed"
          style={{
            fontFamily: "var(--font-display)",
            fontStyle: "italic",
            fontWeight: 500,
            color: "var(--color-ink)",
          }}
        >
          {verse.text}
        </p>
        <p
          className="mb-6 text-sm"
          style={{ fontFamily: "var(--font-mono)", color: "var(--color-ink-soft)" }}
        >
          {verse.ref}
        </p>
        <button
          onClick={dismiss}
          className="btn btn-primary w-full px-6 py-3 text-sm"
          style={{ fontFamily: "var(--font-body)" }}
        >
          Begin my morning
        </button>
      </div>
    </div>
  );
}
