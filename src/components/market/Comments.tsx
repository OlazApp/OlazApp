"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Avatar } from "@/components/market/ui";
import { PracticeGate } from "@/components/practice/Gate";
import { useNow } from "@/components/providers/BoardProvider";
import { usePractice } from "@/components/providers/PracticeProvider";
import { ago } from "@/lib/rounds";

type Comment = { id: number; address: string; text: string; at: number };

/** Comment thread for a market. Read by anyone, written after wallet sign-in. */
export function Comments({ thread }: { thread: string }) {
  const { status } = usePractice();
  const [items, setItems] = useState<Comment[] | null>(null);
  const [storage, setStorage] = useState(true);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const now = useNow(30_000);

  const load = useCallback(() => {
    fetch(`/api/comments?thread=${thread}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((b: { items?: Comment[]; storage?: boolean }) => {
        setItems(b.items ?? []);
        setStorage(b.storage !== false);
      })
      .catch(() => setItems([]));
  }, [thread]);

  useEffect(() => {
    const first = window.setTimeout(load, 0);
    const t = window.setInterval(() => !document.hidden && load(), 20_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(t);
    };
  }, [load]);

  const post = async () => {
    const text = draft.trim();
    if (!text) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/comments", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ thread, text }) }).catch(() => null);
    setBusy(false);
    if (!res) return setError("Network error.");
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return setError(body.error ?? "Could not post.");
    setDraft("");
    load();
  };

  return (
    <div>
      {status === "ready" ? (
        <div className="flex flex-col gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, 400))}
            rows={2}
            placeholder="Your read on this market…"
            className="field resize-none text-[14px]"
            data-testid="comment-input"
          />
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] text-ink-3">{draft.length}/400</span>
            <button type="button" onClick={post} disabled={busy || !draft.trim()} className="btn btn-ink h-9 px-4 text-[13px]">
              {busy ? "Posting…" : "Post"}
            </button>
          </div>
          {error ? <p className="text-[12.5px] text-down">{error}</p> : null}
        </div>
      ) : (
        <PracticeGate why="to comment" />
      )}
      <ul className="mt-4">
        {items === null ? <li className="py-4 text-sm text-ink-3">Loading comments…</li> : null}
        {items !== null && items.length === 0 ? (
          <li className="py-6 text-center text-sm text-ink-3">{storage ? "No comments yet." : "Comments open once storage is configured."}</li>
        ) : null}
        {(items ?? []).map((c) => (
          <li key={c.id} className="flex gap-3 border-b border-line py-3">
            <Avatar address={c.address} size={30} />
            <div className="min-w-0 flex-1">
              <p className="text-[12px] text-ink-3">
                <Link href={`/trader/${c.address}`} className="font-mono font-medium text-ink hover:underline">
                  {c.address.slice(0, 6)}…{c.address.slice(-4)}
                </Link>{" "}
                · {now ? ago(c.at, now) : ""}
              </p>
              <p className="mt-0.5 text-[14px] leading-relaxed break-words whitespace-pre-wrap">{c.text}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
