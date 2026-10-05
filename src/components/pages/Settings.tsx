"use client";

import { useState } from "react";
import { PracticeGate } from "@/components/practice/Gate";
import { usePractice } from "@/components/providers/PracticeProvider";
import { STAKE_KEY, useClock, useLocal } from "@/components/providers/useLocal";
import { STAKE_PRESETS } from "@/lib/rounds";

export function Settings() {
  const { status, account, rename, signOut } = usePractice();
  const { mode, setMode } = useClock();
  const [stake, setStake] = useLocal<number>(STAKE_KEY, 0.005);
  const [name, setName] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const value = name ?? account?.name ?? "";
  const row = "grid gap-3 border-b border-line py-5 sm:grid-cols-[220px_1fr]";
  return (
    <main className="mx-auto max-w-[900px] px-4 pt-8 pb-8 sm:px-6">
      <h1 className="h-display text-[56px] sm:text-[72px]">Settings</h1>
      <div className="mt-6 border-t border-ink">
        <div className={row}>
          <div>
            <p className="font-semibold">Display name</p>
            <p className="text-[13px] text-ink-3">Shown on the leaderboard and your profile instead of the address.</p>
          </div>
          {status === "ready" ? (
            <div>
              <div className="flex gap-2">
                <input value={value} onChange={(e) => setName(e.target.value)} placeholder="your_name" className="field max-w-xs" maxLength={18} data-testid="name-input" />
                <button
                  type="button"
                  className="btn btn-ink h-10 px-4"
                  onClick={async () => {
                    const r = await rename(value);
                    setMsg(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.error });
                  }}
                >
                  Save
                </button>
              </div>
              {msg ? <p className={`mt-2 text-[13px] ${msg.ok ? "text-up" : "text-down"}`}>{msg.text}</p> : null}
            </div>
          ) : (
            <PracticeGate compact why="to set a name" />
          )}
        </div>
        <div className={row}>
          <div>
            <p className="font-semibold">Default stake</p>
            <p className="text-[13px] text-ink-3">Pre-filled in the entry panel. Kept in this browser.</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {STAKE_PRESETS.map((v) => (
              <button key={v} type="button" onClick={() => setStake(v)} className={`cursor-pointer rounded-md border px-3 py-1.5 font-mono text-[13px] ${stake === v ? "border-ink bg-ink text-chalk" : "border-line-2 bg-card"}`}>
                {v} pETH
              </button>
            ))}
          </div>
        </div>
        <div className={row}>
          <div>
            <p className="font-semibold">Times</p>
            <p className="text-[13px] text-ink-3">Rounds are cut on UTC boundaries either way.</p>
          </div>
          <div className="flex gap-1.5">
            {(
              [
                ["local", "My time zone"],
                ["utc", "UTC"],
              ] as const
            ).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setMode(k)} className={`cursor-pointer rounded-md border px-3 py-1.5 text-[14px] ${mode === k ? "border-ink bg-ink text-chalk" : "border-line-2 bg-card"}`}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <div className={row}>
          <div>
            <p className="font-semibold">Walkthrough</p>
            <p className="text-[13px] text-ink-3">The four-step intro from your first visit.</p>
          </div>
          <div>
            <button type="button" onClick={() => window.dispatchEvent(new Event("olaz:intro"))} className="btn btn-ghost h-10 px-4">
              Show again
            </button>
          </div>
        </div>
        {status === "ready" ? (
          <div className={row}>
            <div>
              <p className="font-semibold">Session</p>
              <p className="text-[13px] text-ink-3">Signs this browser out. Your practice record stays with your address.</p>
            </div>
            <div>
              <button type="button" onClick={() => signOut()} className="btn btn-ghost h-10 px-4 text-down">
                Sign out
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
