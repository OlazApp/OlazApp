"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { AssetLogo } from "@/components/AssetLogo";
import { RoundChart, type Point } from "@/components/market/Chart";
import { Comments } from "@/components/market/Comments";
import { Countdown, fmtMult } from "@/components/market/ui";
import { useNow } from "@/components/providers/BoardProvider";
import { PracticeGate } from "@/components/practice/Gate";
import { usePractice } from "@/components/providers/PracticeProvider";
import { STAKE_KEY, useClock, useLocal } from "@/components/providers/useLocal";
import { FEE_BPS, FEE_LABEL, MAX_STAKE, MIN_STAKE, STAKE_PRESETS, fmtEth, fmtPrice, fromMicro } from "@/lib/rounds";

type Bucket = { lo: number | null; hi: number | null; label: string };
type Week = {
  id: string;
  title: string;
  asset: { id: string; symbol: string; name: string; logo: string | null; sourceLabel: string };
  start: number;
  end: number;
  entriesClose: number;
  open: number | null;
  current: number | null;
  leading: number | null;
  buckets: Bucket[];
  pools: number[];
  count: number;
  previous: { close: number | null; winner: number; label: string | null } | null;
  chart: Point[];
  storage: boolean;
};

export function WeekView({ id }: { id: string }) {
  const [w, setW] = useState<Week | null>(null);
  const [pick, setPick] = useState<number | null>(null);
  const [stakePref, setStakePref] = useLocal<number>(STAKE_KEY, 0.005);
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const { status, enterWeek, account } = usePractice();
  const { time } = useClock();
  const now = useNow(5000);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch(`/api/week/${id}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((b: Week) => !cancelled && setW(b))
        .catch(() => {});
    load();
    const t = window.setInterval(() => !document.hidden && load(), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [id]);

  if (!w) return <main className="mx-auto h-[70vh] max-w-[1320px] animate-pulse px-4 pt-6 sm:px-6" />;
  const total = w.pools.reduce((a, b) => a + b, 0);
  const closed = now !== null && now > w.entriesClose;
  const stakeText = draft ?? String(stakePref);
  const stake = Number(stakeText);
  const valid = Number.isFinite(stake) && stake >= MIN_STAKE && stake <= MAX_STAKE;
  const mult = (i: number, add = 0) => {
    const mine = (w.pools[i] ?? 0) + add;
    const t = total + add;
    return mine > 0 && t > mine ? (t * (1 - FEE_BPS / 10_000)) / mine : null;
  };
  const myHere = (account?.positions ?? []).filter((p) => p.kind === "week" && p.market === id && p.start === w.start);

  const submit = async () => {
    if (pick === null || !valid) return;
    setBusy(true);
    setNote(null);
    const r = await enterWeek(id, pick, stake);
    setBusy(false);
    if (r.ok) {
      setStakePref(stake);
      setNote({ ok: true, text: `${fmtEth(stake)} pETH on ${w.buckets[pick].label}.` });
      fetch(`/api/week/${id}`).then((x) => x.json()).then(setW).catch(() => {});
    } else setNote({ ok: false, text: r.error });
  };

  return (
    <main className="mx-auto max-w-[1320px] px-4 pt-5 pb-8 sm:px-6">
      <Link href="/weekly" className="inline-flex items-center gap-1.5 text-[13px] text-ink-2 hover:text-ink">
        <ArrowLeft className="size-3.5" /> Weekly ranges
      </Link>
      <div className="mt-3 grid gap-6 lg:grid-cols-[1fr_380px] lg:gap-x-8">
        <div className="min-w-0 lg:col-start-1 lg:row-start-1">
          <div className="flex items-start gap-3">
            <AssetLogo src={w.asset.logo} symbol={w.asset.symbol} size={48} />
            <div className="min-w-0">
              <h1 className="text-[22px] leading-tight font-semibold sm:text-[26px]">{w.title}</h1>
              <p className="mt-1 text-[13px] text-ink-3">
                Week of {time(w.start, true)} · settles at {time(w.end, true)} from {w.asset.sourceLabel}
              </p>
            </div>
          </div>

          <section className="panel mt-4 overflow-hidden">
            <div className="grid grid-cols-2 border-b border-line sm:grid-cols-4">
              {[
                { k: "Week open", v: w.open ? `$${fmtPrice(w.open)}` : "—" },
                { k: "Now", v: w.current ? `$${fmtPrice(w.current)}` : "—" },
                { k: "Leading range", v: w.leading !== null && w.leading >= 0 ? w.buckets[w.leading]?.label : "—" },
                { k: closed ? "Settles in" : "Entries close in", v: <Countdown to={closed ? w.end : w.entriesClose} /> },
              ].map((c, i) => (
                <div key={c.k} className={`min-w-0 px-4 py-3 ${i % 2 ? "border-l border-line" : ""} ${i >= 2 ? "border-t border-line sm:border-t-0 sm:border-l" : ""}`}>
                  <p className="label">{c.k}</p>
                  <div className="num mt-1 text-[16px] font-semibold break-words">{c.v}</div>
                </div>
              ))}
            </div>
            <div className="px-2 pt-2 sm:px-3">
              <RoundChart points={w.chart} lock={w.open} from={w.start} to={w.end} roundStart={w.start} format={(v) => `$${fmtPrice(v)}`} height={240} />
            </div>
          </section>

          <section className="mt-6">
            <div className="flex items-end justify-between border-b border-ink pb-2">
              <h2 className="h-display text-[24px]">Ranges</h2>
              <span className="font-mono text-[11px] text-ink-3">
                pool {fmtEth(fromMicro(total))} pETH · {w.count} entries
              </span>
            </div>
            <ul>
              {w.buckets.map((b, i) => {
                const share = total ? (w.pools[i] ?? 0) / total : 0;
                const leading = w.leading === i;
                return (
                  <li key={b.label}>
                    <button
                      type="button"
                      onClick={() => setPick(i)}
                      disabled={closed}
                      className={`flex w-full cursor-pointer items-center gap-3 border-b border-line px-2 py-3 text-left transition-colors disabled:cursor-default ${pick === i ? "bg-amber-soft" : "hover:bg-card"}`}
                      data-testid="bucket"
                    >
                      <span className={`size-3 shrink-0 rounded-full border ${pick === i ? "border-ink bg-ink" : "border-line-2"}`} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-medium">
                          {b.label} {leading ? <span className="chip chip-up ml-1">price is here</span> : null}
                        </span>
                        <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-line">
                          <span className="block h-full bg-ink" style={{ width: `${share * 100}%` }} />
                        </span>
                      </span>
                      <span className="num w-12 text-right text-[14px] font-semibold">{Math.round(share * 100)}%</span>
                      <span className="num w-14 text-right text-[12px] text-ink-3">{fmtMult(mult(i))}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {w.previous ? (
              <p className="mt-3 text-[13px] text-ink-2">
                Last week closed at <span className="num font-semibold">${fmtPrice(w.previous.close)}</span> in {w.previous.label}.
              </p>
            ) : null}
          </section>

        </div>

        <aside className="min-w-0 space-y-5 lg:sticky lg:top-[120px] lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
          <div className="panel overflow-hidden">
            <div className="bg-board px-4 py-3 text-chalk">
              <p className="font-mono text-[10px] tracking-[0.08em] text-chalk/55 uppercase">This week</p>
              <p className="text-[14px] font-semibold">{closed ? "Entries closed · waiting for the close" : pick === null ? "Pick a range" : w.buckets[pick].label}</p>
            </div>
            <div className="space-y-4 p-4">
              {closed ? (
                <p className="text-[13.5px] leading-relaxed text-ink-2">
                  Entries close 48 hours before the week ends so nobody buys a range that is already decided. The next week opens Monday 00:00 UTC.
                </p>
              ) : (
                <>
                  <div>
                    <label htmlFor="wstake" className="label">
                      Stake (pETH)
                    </label>
                    <input id="wstake" inputMode="decimal" value={stakeText} onChange={(e) => setDraft(e.target.value.replace(/[^0-9.]/g, ""))} className="field num mt-1.5 text-[18px] font-semibold" />
                    <div className="mt-2 grid grid-cols-4 gap-1.5">
                      {STAKE_PRESETS.map((v) => (
                        <button key={v} type="button" onClick={() => setDraft(String(v))} className={`cursor-pointer rounded-md border py-1.5 font-mono text-[12px] ${stake === v ? "border-ink bg-ink text-chalk" : "border-line-2 bg-card hover:border-ink"}`}>
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-md bg-paper px-3 py-2.5 text-[13px]">
                    <div className="flex justify-between">
                      <span className="text-ink-2">If it closes in this range</span>
                      <span className="num font-semibold">{pick !== null && valid && mult(pick, stake * 1e6) ? `${fmtEth(stake * mult(pick, stake * 1e6)!, 5)} pETH` : "—"}</span>
                    </div>
                    <p className="mt-1 text-[11.5px] text-ink-3">{FEE_LABEL}. Only one range with stakes, or nobody on the winning range, refunds everyone.</p>
                  </div>
                  {status === "ready" ? (
                    <button type="button" onClick={submit} disabled={busy || pick === null || !valid} className="btn btn-ink h-12 w-full text-[15px]" data-testid="week-submit">
                      {busy ? "Placing…" : pick === null ? "Pick a range" : "Place · practice"}
                    </button>
                  ) : (
                    <PracticeGate compact />
                  )}
                </>
              )}
              {note ? <p className={`text-[13px] ${note.ok ? "text-up" : "text-down"}`}>{note.text}</p> : null}
              {myHere.length ? (
                <ul className="border-t border-line pt-3 text-[13px]">
                  {myHere.map((p) => (
                    <li key={p.id} className="flex justify-between py-1">
                      <span>{w.buckets[Number(p.side)]?.label}</span>
                      <span className="num">{fmtEth(fromMicro(p.stake))} pETH</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        </aside>
        <div className="min-w-0 lg:col-start-1 lg:row-start-2">
          <section className="lg:mt-2">
            <div className="border-b border-ink pb-2">
              <h2 className="h-display text-[24px]">Comments</h2>
            </div>
            <div className="pt-4">
              <Comments thread={`week-${id}`} />
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
